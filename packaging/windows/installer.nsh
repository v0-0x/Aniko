; Included in the Windows installer by electron-builder
; (desktop/electron-builder.yml, nsis.include).
!include LogicLib.nsh
!include x64.nsh

; Nyakuro installs for the current user only: no admin rights, and no
; "Anyone who uses this computer / Only for me" page.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

; Nyakuro was called Aniko until 3.0.58, and Kumo before 2.0.37: an update
; over Aniko (or Kumo) installs in a Nyakuro folder next to the old one
; (...\Programs\Nyakuro), and the old version's own uninstaller then removes
; the old one, as with any update.
!macro customInit
  StrCpy $0 $INSTDIR "" -6
  ${if} $0 == "\Aniko"
    StrCpy $INSTDIR $INSTDIR -6
    StrCpy $INSTDIR "$INSTDIR\Nyakuro"
  ${endIf}
  StrCpy $0 $INSTDIR "" -5
  ${if} $0 == "\Kumo"
    StrCpy $INSTDIR $INSTDIR -5
    StrCpy $INSTDIR "$INSTDIR\Nyakuro"
  ${endIf}
!macroend

; The programs Nyakuro uses (ffmpeg, yt-dlp, Git's bash, ani-cli, mpv...) aren't
; installed here: Nyakuro downloads them itself, from the notice on its Home
; page or Settings > Desktop app & programs (server/internal/winsetup).
!macro customInstall
  ; Explorer keeps showing the icons it cached for Nyakuro's shortcuts: tell it
  ; icons changed, so a new logo shows right after an update.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ; Started with Windows (desktop/main.js setStartAtLogin): the entry names
  ; the program, which an update over Aniko or Kumo moved and renamed.
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "app.kumo.desktop"
  ${if} $0 != ""
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "app.kumo.desktop" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --background'
  ${endIf}
  ; Let the other devices reach Nyakuro (library sharing, the TV app): a
  ; Windows Firewall rule for the server, on private networks, for its port
  ; and the port it announces itself on. Without it the firewall asks the
  ; first time sharing is turned on, and drops the announcements of the
  ; others (the server then looks offline between its answers). Adding a
  ; rule needs an administrator's yes, once; an update keeps the rule. The
  ; rule Aniko's installer added (Nyakuro's old name) goes with the old one.
  ${ifNot} ${Silent}
  ${andIfNot} ${isUpdated}
    ${if} ${Cmd} `MessageBox MB_YESNO|MB_ICONQUESTION "Let the other devices on your home network reach Nyakuro?$\r$\n$\r$\nThis adds a Windows Firewall rule for Nyakuro's server on private networks (for library sharing, the media server and the TV app). Windows asks for an administrator's permission once. Without it, Windows asks when sharing is first turned on, and the other devices may show as offline now and then.$\r$\n$\r$\nYou can add it later with: netsh advfirewall firewall add rule name=Nyakuro dir=in action=allow program=nyakuro.exe" /SD IDYES IDYES`
      ExecShell "runas" "$SYSDIR\cmd.exe" '/c netsh advfirewall firewall delete rule name="Nyakuro" >nul 2>&1 & netsh advfirewall firewall delete rule name="Aniko" >nul 2>&1 & netsh advfirewall firewall add rule name="Nyakuro" dir=in action=allow program="$INSTDIR\resources\nyakuro.exe" protocol=TCP localport=43211 profile=private & netsh advfirewall firewall add rule name="Nyakuro" dir=in action=allow program="$INSTDIR\resources\nyakuro.exe" protocol=UDP localport=43212 profile=private' SW_HIDE
    ${endIf}
  ${endIf}
!macroend

; Uninstalled (not updated): Nyakuro's "start with Windows" entry goes too
; (desktop/main.js setStartAtLogin), or Startup apps keeps a dead "Nyakuro".
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "app.kumo.desktop"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "app.kumo.desktop"
    ; The firewall rule too, and Aniko's (an administrator's yes; declining
    ; keeps a rule for a program that's gone, which does nothing).
    ${ifNot} ${Silent}
      ExecShell "runas" "$SYSDIR\cmd.exe" '/c netsh advfirewall firewall delete rule name="Nyakuro" & netsh advfirewall firewall delete rule name="Aniko"' SW_HIDE
    ${endIf}
  ${endIf}
!macroend
