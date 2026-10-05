; Script Inno Setup 7.x - Dong goi VideoTranslate AI (OmniVoice Studio)
; Tac gia: Tran Van Kha
; Phien ban: 3.8.1

#define MyAppName "VideoTranslate AI"
#define MyAppVersion "3.8.2"
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
; Sao chep toan bo ma nguon va moi truong, LOAI TRU TOAN BO video/audio render thu nghiem, logs va cache
Source: "..\\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.git*,*.vscode*,*installer_output*,*.iss,*__pycache__*,*.pyc,*.pyo,*logs\\*,*backend\\logs\\*,*outputs\\*,*backend\\outputs\\*,*notebooks\\*,*.tmp,*.bak,AGENTS.rar"

[Dirs]
; Tao san cac thu muc luu tru trong de he thong tu dong luu video/audio moi khi nguoi dung su dung
Name: "{app}\outputs"
Name: "{app}\backend\outputs"
Name: "{app}\backend\outputs\translate"
Name: "{app}\backend\outputs\captions"
Name: "{app}\backend\outputs\audios"
Name: "{app}\backend\outputs\alignment"
Name: "{app}\backend\outputs\dubbing"
Name: "{app}\logs"
Name: "{app}\backend\logs"

[Icons]
; Tao Shortcut ngoai Desktop kem Icon app.ico
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\assets\app.ico"; Tasks: desktopicon; Comment: "Khoi dong {#MyAppName} - OmniVoice Studio"
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\assets\app.ico"
Name: "{group}\Go cai dat {#MyAppName}"; Filename: "{uninstallexe}"

[Run]
; Tuy chon khoi chay ung dung ngay sau khi cai dat xong
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: shellexec postinstall nowait skipifsilent
