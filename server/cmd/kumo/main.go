// Command kumo is the Kumo anime server. It serves the API and the web UI on
// 127.0.0.1 (and optionally your LAN) and is started by the desktop app.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"slices"
	"strings"
	"syscall"

	"github.com/simo1337s/animetest/server/internal/api"
	"github.com/simo1337s/animetest/server/internal/app"
	"github.com/simo1337s/animetest/server/internal/config"
	"github.com/simo1337s/animetest/server/internal/db"
	"github.com/simo1337s/animetest/server/internal/kumohub"
	"github.com/simo1337s/animetest/server/internal/lifecycle"
	"github.com/simo1337s/animetest/server/internal/util"
	"github.com/simo1337s/animetest/server/internal/webui"
)

func main() {
	// The hub's own program (packaging/hub) is a Kumo Hub without being
	// asked, with its data apart from a Kumo's on the same computer.
	asHub := strings.TrimSuffix(filepath.Base(os.Args[0]), ".exe") == "kumo-hub"
	defaultData := config.DataDir()
	if asHub && os.Getenv("KUMO_DATA_DIR") == "" {
		defaultData = filepath.Join(filepath.Dir(defaultData), "kumo-hub")
	}
	var (
		dataDir = flag.String("data-dir", defaultData, "where Kumo stores its database")
		port    = flag.Int("port", 0, "override the port (default from settings, 43211)")
		webUI   = flag.Bool("web-ui", false, "force-enable the browser web UI for this run")
		desktop = flag.Bool("desktop", false, "started by the desktop app")
		version = flag.Bool("version", false, "print the version")
		// A Kumo Hub: shares its library with the Kumo apps on the network and
		// keeps them in step; plays nothing (a Raspberry Pi, say).
		hub           = flag.Bool("hub", asHub, "run as a Kumo Hub (no player; a dashboard at http://<this computer>:<port>)")
		setupCode     = flag.Bool("setup-code", false, "print a Kumo Hub's setup code (to set its dashboard's password) and stop")
		resetPassword = flag.Bool("reset-password", false, "remove a Kumo Hub's dashboard password (set a new one with its setup code) and stop")
		setChannel    = flag.String("set-channel", "", "save which updates to take, stable or beta (a hub installed from a beta follows the betas), and stop")
		// Windows has no signals to ask a program to stop: the desktop app
		// closes the server's input instead.
		exitWithStdin = flag.Bool("exit-with-stdin", false, "stop when standard input closes")
	)
	flag.Parse()
	if *version {
		fmt.Println(config.AppName, config.AppVersion)
		return
	}
	if *setupCode {
		printSetupCode(*dataDir)
		return
	}
	if *resetPassword {
		resetHubPassword(*dataDir)
		return
	}
	if *setChannel != "" {
		saveChannel(*dataDir, *setChannel)
		return
	}
	// Whatever Kumo starts (ffmpeg, ani-cli, mpv) ends with it, even when
	// it's killed.
	if err := util.BindChildren(); err != nil {
		log.Printf("child processes won't end with Kumo: %v", err)
	}
	if err := os.MkdirAll(*dataDir, 0o700); err != nil {
		log.Fatal(err)
	}
	// Programs the macOS setup installs (Settings > App > Programs).
	util.SetToolsDir(filepath.Join(*dataDir, "bin"))
	a, err := app.New(*dataDir, app.Options{Hub: *hub})
	if err != nil {
		log.Fatal(err)
	}
	// An app's own window (Android's) proves itself with the token it gives
	// (in a cookie): other apps on the device reach 127.0.0.1 too, so they
	// mustn't count as this device's user.
	appWindow := false
	if t := os.Getenv("KUMO_SHELL_TOKEN"); len(t) >= 32 {
		a.ShellToken, appWindow = t, true
	}
	_ = os.Unsetenv("KUMO_SHELL_TOKEN")
	if *port > 0 {
		cfg := a.Settings.Get()
		cfg.Server.Port = *port
		if _, err := a.Settings.Save(cfg); err != nil {
			log.Fatal(err)
		}
	}
	tokenPath := a.WriteShellToken()
	srv := api.New(a, webui.FS())
	// Without the desktop app nothing could reach the server if the web UI
	// were off, so headless runs always serve it (on 127.0.0.1 by default).
	srv.ForceWebUI = *webUI || *hub || (!*desktop && !appWindow)
	srv.AppOnly = appWindow
	if err := srv.Start(); err != nil {
		log.Fatalf("could not start the server: %v (is Kumo already running?)", err)
	}
	a.Start()
	cfg := a.Settings.Get()
	// Lets the desktop app find an already running server.
	infoPath := filepath.Join(config.RuntimeDir(), "server.json")
	writeInfo := func() {
		raw, _ := json.Marshal(map[string]any{"pid": os.Getpid(), "port": a.Settings.Get().Server.Port, "addr": srv.Addr(), "tokenFile": tokenPath})
		_ = os.WriteFile(infoPath, raw, 0o600)
	}
	// (Not a hub's: the desktop app isn't to find it.)
	if a.HubStore == nil {
		writeInfo()
		a.Settings.OnChange(func(_, _ config.Settings) { writeInfo() })
	}
	log.Printf("%s %s ready — data: %s — shell token: %s", config.AppName, config.AppVersion, *dataDir, tokenPath)
	if a.HubStore != nil {
		log.Printf("Kumo Hub dashboard: http://%s:%d", hubHost(), cfg.Server.Port)
		if cfg.Server.Password == "" {
			log.Printf("Kumo Hub setup code: %s (to set the dashboard's password)", a.HubStore.SetupCode())
		}
	} else if srv.ForceWebUI || cfg.Server.WebUI {
		log.Printf("Web UI: http://127.0.0.1:%d", cfg.Server.Port)
	}

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	if *exitWithStdin {
		go func() {
			_, _ = io.Copy(io.Discard, os.Stdin)
			sig <- syscall.SIGTERM
		}()
	}
	// A signal, or a request from inside Kumo (the updater restarting it
	// into a new version): both shut down the same way.
	var exit lifecycle.Exit
	select {
	case <-sig:
	case exit = <-a.Exits.C():
	}
	log.Printf("shutting down…")
	srv.Shutdown()
	a.Shutdown()
	_ = os.Remove(tokenPath)
	_ = os.Remove(infoPath)
	end(exit, *desktop)
}

// end finishes the process the way exit asks, once Kumo has shut down.
func end(exit lifecycle.Exit, desktop bool) {
	restart := exit.Restart
	if exit.Before != nil {
		if err := exit.Before(); err != nil {
			log.Printf("%v; starting Kumo again", err)
			restart = true
		}
	}
	if !restart {
		if exit.Code != 0 {
			os.Exit(exit.Code)
		}
		return
	}
	// The desktop app started this server: it starts everything again, its
	// window included. Otherwise (a systemd service, a terminal) the server
	// runs itself again, in place, where the system can.
	if !desktop && canReexec {
		err := reexec()
		log.Printf("could not start Kumo again: %v", err)
	}
	os.Exit(lifecycle.CodeRestart)
}

// hubHost is how the hub is reached on the network: its name (a Pi is
// raspberrypi.local), for the log.
func hubHost() string {
	n, err := os.Hostname()
	if err != nil || n == "" {
		return "<this computer>"
	}
	if !strings.Contains(n, ".") {
		n += ".local"
	}
	return n
}

// openSettings opens the database in dataDir and its settings, for the
// flags that only read or save one and stop.
func openSettings(dataDir string) (*db.DB, *config.Store) {
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		log.Fatal(err)
	}
	d, err := db.Open(filepath.Join(dataDir, "kumo.db"))
	if err != nil {
		log.Fatal(err)
	}
	settings, err := config.NewStore(d)
	if err != nil {
		log.Fatal(err)
	}
	return d, settings
}

// printSetupCode prints a hub's setup code, or that its password is set.
func printSetupCode(dataDir string) {
	d, settings := openSettings(dataDir)
	defer d.Close()
	if settings.Get().Server.Password != "" {
		fmt.Println("The hub's password is set already: sign in to its dashboard with it.")
		return
	}
	h, err := kumohub.New(d)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(h.SetupCode())
}

// saveChannel saves the update channel (Settings › Updates & about).
func saveChannel(dataDir, channel string) {
	if !slices.Contains(config.UpdateChannels, channel) {
		log.Fatalf("--set-channel takes %s, not %q", strings.Join(config.UpdateChannels, " or "), channel)
	}
	d, settings := openSettings(dataDir)
	defer d.Close()
	cfg := settings.Get()
	cfg.Updates.Channel = channel
	if _, err := settings.Save(cfg); err != nil {
		log.Fatal(err)
	}
	fmt.Println("Updates:", channel)
}

// resetHubPassword removes a hub's dashboard password, for its owner who
// forgot it: the dashboard asks for the setup code again.
func resetHubPassword(dataDir string) {
	d, settings := openSettings(dataDir)
	defer d.Close()
	cfg := settings.Get()
	cfg.Server.Password = ""
	if _, err := settings.Save(cfg); err != nil {
		log.Fatal(err)
	}
	h, err := kumohub.New(d)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("The dashboard's password is removed: open the dashboard and set a new one with the setup code", h.SetupCode())
}
