; Script Inno Setup 7.x - Dong goi VideoTranslate AI (OmniVoice Studio)
; Tac gia: Tran Van Kha
; Phien ban: 3.8.1

#define MyAppName "VideoTranslate AI"
#define MyAppVersion "3.8.1"
#define MyAppPublisher "Tran Van Kha"
#define MyAppURL "https://github.com/tranvankha1989/TranslateVideo"
#define MyAppExeName "start.bat"

[Setup]
; Thong tin dinh danh duy nhat cua ung dung
AppId={{A78C56B2-E859-4D2A-92F6-B2D97D841234}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}

; Thu muc cai dat mac dinh tren may khach (C:\Program Files\VideoTranslateAI hoac C:\VideoTranslateAI)
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes

; Duong dan luu file cai dat dau ra va ten file Setup
OutputDir=..\installer_output
OutputBaseFilename=VideoTranslateAI_v{#MyAppVersion}_Setup
SetupIconFile=..\assets\app.ico
UninstallDisplayIcon={app}\assets\app.ico

; Che do nen toi uu nhat de giam dung luong file cai dat
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible

; Yeu cau quyen Administrator de cai dat vao Program Files
PrivilegesRequired=admin

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

[Files]
; Sao chep toan bo thu muc du an vao thu muc cai dat, loai tru cac file rac va .git
Source: "..\\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.git*,*.vscode*,*installer_output*,*.iss,*__pycache__*,*logs\\*.log,*outputs\\translate\\*,*outputs\\captions\\*,*outputs\\audios\\*"

[Icons]
; Tao Shortcut ngoai Desktop kem Icon app.ico
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\assets\app.ico"; Tasks: desktopicon; Comment: "Khoi dong {#MyAppName} - OmniVoice Studio"
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\assets\app.ico"
Name: "{group}\Go cai dat {#MyAppName}"; Filename: "{uninstallexe}"

[Run]
; Tuy chon khoi chay ung dung ngay sau khi cai dat xong
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: shellexec postinstall nowait skipifsilent
