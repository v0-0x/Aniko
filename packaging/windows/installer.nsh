; Included in the Windows installer by electron-builder
; (desktop/electron-builder.yml, nsis.include).
!include LogicLib.nsh
!include x64.nsh

; Aniko installs for the current user only: no admin rights, and no
; "Anyone who uses this computer / Only for me" page.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

; Aniko was called Kumo before 2.0.37: an update over Kumo installs in an
; Aniko folder next to Kumo's (...\Programs\Aniko), and Kumo's own uninstaller
; then removes the Kumo one, as with any update.
!macro customInit
  StrCpy $0 $INSTDIR "" -5
  ${if} $0 == "\Kumo"
    StrCpy $INSTDIR $INSTDIR -5
    StrCpy $INSTDIR "$INSTDIR\Aniko"
  ${endIf}
!macroend

; After a normal install (not a silent one, such as Aniko's own updates):
; offer to install the programs Aniko uses (Scoop, Git, ani-cli, ffmpeg, mpv,
; yt-dlp...) with resources\install-tools.ps1, in a PowerShell window that
; shows the progress. The installer doesn't wait for it.
!macro customInstall
  ; Explorer keeps showing the icons it cached for Aniko's shortcuts: tell it
  ; icons changed, so a new logo shows right after an update.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ; Started with Windows (desktop/main.js setStartAtLogin): the entry names
  ; the program, which an update over Kumo moved and renamed.
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "app.kumo.desktop"
  ${if} $0 != ""
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "app.kumo.desktop" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --background'
  ${endIf}
  ; Let the other devices reach Aniko (library sharing, the TV app): a
  ; Windows Firewall rule for the server, on private networks, for its port
  ; and the port it announces itself on. Without it the firewall asks the
  ; first time sharing is turned on, and drops the announcements of the
  ; others (the server then looks offline between its answers). Adding a
  ; rule needs an administrator's yes, once; an update keeps the rule.
  ${ifNot} ${Silent}
  ${andIfNot} ${isUpdated}
    ${if} ${Cmd} `MessageBox MB_YESNO|MB_ICONQUESTION "Let the other devices on your home network reach Aniko?$\r$\n$\r$\nThis adds a Windows Firewall rule for Aniko's server on private networks (for library sharing, the media server and the TV app). Windows asks for an administrator's permission once. Without it, Windows asks when sharing is first turned on, and the other devices may show as offline now and then.$\r$\n$\r$\nYou can add it later with: netsh advfirewall firewall add rule name=Aniko dir=in action=allow program=aniko.exe" /SD IDYES IDYES`
      ExecShell "runas" "$SYSDIR\cmd.exe" '/c netsh advfirewall firewall delete rule name="Aniko" >nul 2>&1 & netsh advfirewall firewall add rule name="Aniko" dir=in action=allow program="$INSTDIR\resources\aniko.exe" protocol=TCP localport=43211 profile=private & netsh advfirewall firewall add rule name="Aniko" dir=in action=allow program="$INSTDIR\resources\aniko.exe" protocol=UDP localport=43212 profile=private' SW_HIDE
    ${endIf}
  ${endIf}
  ${ifNot} ${Silent}
  ${andIfNot} ${isUpdated}
    ${if} ${Cmd} `MessageBox MB_YESNO|MB_ICONQUESTION "Install the programs Aniko uses?$\r$\n$\r$\nAniko can install Git, ani-cli, ffmpeg, mpv, yt-dlp and the rest of what it uses with Scoop, for your Windows user (no administrator rights). A PowerShell window shows the progress: it takes a few minutes and needs an internet connection. Programs you already have are skipped.$\r$\n$\r$\nYou can also do this later in Aniko: Settings > Desktop app & programs." /SD IDNO IDYES`
      ; The 64-bit PowerShell, also from this 32-bit installer.
      ${DisableX64FSRedirection}
      Exec '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\install-tools.ps1"'
      ${EnableX64FSRedirection}
    ${endIf}
  ${endIf}
!macroend

; Uninstalled (not updated): Aniko's "start with Windows" entry goes too
; (desktop/main.js setStartAtLogin), or Startup apps keeps a dead "Aniko".
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "app.kumo.desktop"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "app.kumo.desktop"
    ; The firewall rule too (an administrator's yes; declining keeps a rule
    ; for a program that's gone, which does nothing).
    ${ifNot} ${Silent}
      ExecShell "runas" "$SYSDIR\cmd.exe" '/c netsh advfirewall firewall delete rule name="Aniko"' SW_HIDE
    ${endIf}
  ${endIf}
!macroend
