; ==============================================================================
; BCS Enterprise POS PRO Max - Custom NSIS Cyber Installer Script
; Plays Quantum Reactor Animation during Installation
; ==============================================================================

!macro customInit
  !ifndef BUILD_UNINSTALLER
    InitPluginsDir
    File /oname=$PLUGINSDIR\bcs_anim.gif "${BUILD_RESOURCES_DIR}\bcs_anim.gif"
  !endif
!macroend

!macro customInstall
  !ifndef BUILD_UNINSTALLER
    AnimGif::play /NOUNLOAD /halign=center /valign=center "$PLUGINSDIR\bcs_anim.gif"
  !endif
!macroend
