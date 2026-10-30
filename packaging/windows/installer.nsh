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
  ${endIf}
!macroend
