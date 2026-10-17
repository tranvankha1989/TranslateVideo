; Inno Setup Script - KeyGen Admin Desktop Installer
; Tac gia: Tran Van Kha
; Phien ban: 1.0.0

#define MyAppName "KeyGen VideoTranslateAI"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Tran Van Kha"
#define MyAppExeName "KeyGen VideoTranslateAI.exe"

[Setup]
AppId={{D89B5F4A-3211-47BC-B8C1-F0918D68A123}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest

OutputDir=..\installer_output
OutputBaseFilename=KeyGen_VideoTranslateAI_Setup
SetupIconFile=license-key-icon.ico
UninstallDisplayIcon={app}\license-key-icon.ico

Compression=lzma2/fast
SolidCompression=yes
LZMANumBlockThreads=8
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

[Files]
; 1. Cac file chuong trinh chinh duoc build boi PyInstaller
Source: "dist\KeyGen VideoTranslateAI\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "issued_licenses.json,ed25519_private.pem,ed25519_public.pem"

; 2. File co so du lieu licenses: Neu da co tren may thi GIU NGUYEN (khong ghi de lam mat key cu)
Source: "issued_licenses.json"; DestDir: "{app}"; Flags: onlyifdoesntexist

; 3. Khoa bao mat va icon
Source: "ed25519_private.pem"; DestDir: "{app}"; Flags: ignoreversion
Source: "ed25519_public.pem"; DestDir: "{app}"; Flags: ignoreversion
Source: "license-key-icon.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\license-key-icon.ico"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\license-key-icon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
