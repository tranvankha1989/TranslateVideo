; Script Inno Setup 7.x - Dong goi VideoTranslate AI Desktop App (Electron + Standalone AI Runtime)
; Tac gia: Tran Van Kha
; Phien ban: 3.9.0

#define MyAppName "VideoTranslate AI"
#define MyAppVersion "3.9.0"
#define MyAppPublisher "Tran Van Kha"
#define MyAppURL "https://github.com/tranvankha1989/TranslateVideo"
#define MyAppExeName "VideoTranslate AI.exe"

; MAT KHAU / KEY CAI DAT (Nguoi dung bat buoc phai nhap dung moi duoc giai nen & cai dat)
#define MyAppPassword "Aimabiet"

[Setup]
; Dinh danh duy nhat cua ung dung
AppId={{A78C56B2-E859-4D2A-92F6-B2D97D841234}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}

; TINH NANG BAO MAT: Yeu cau nhap Key va ma hoa file Setup chuan AES-256
Password={#MyAppPassword}
Encryption=yes

; KHONG DOI QUYEN ADMIN: Cai dat vao %LocalAppData% giup toan quyen ghi file ma khong can UAC
PrivilegesRequired=lowest
DefaultDirName={localappdata}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes

; Duong dan output va icon
OutputDir=..\installer_output
OutputBaseFilename=VideoTranslateAI_v{#MyAppVersion}_Setup
SetupIconFile=..\assets\app.ico
UninstallDisplayIcon={app}\assets\app.ico

; Che do nen toi uu nhat de giam dung luong file cai dat
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

[Files]
; 1. Electron Native Desktop App Binaries (File .exe chuan khong lo Antivirus chan)
Source: "..\frontend\release\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; 2. Assets & App Icons
Source: "..\assets\*"; DestDir: "{app}\assets"; Flags: ignoreversion recursesubdirs createallsubdirs

; 3. Binaries noi bo FFmpeg (ffmpeg.exe, ffprobe.exe)
Source: "..\bin\*"; DestDir: "{app}\bin"; Flags: ignoreversion recursesubdirs createallsubdirs

; 4. Python Embeddable Runtime (Doc lap 100%, khong can may khach cai Python)
Source: "..\python_runtime\*"; DestDir: "{app}\python_runtime"; Flags: ignoreversion recursesubdirs createallsubdirs

; 5. Backend Source (Loai tru file rac development va cache)
Source: "..\backend\*"; DestDir: "{app}\backend"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.git*,*.vscode*,*venv\*,*__pycache__*,*.pyc,*.pyo,*.log,*logs\*,*outputs\*"

[Dirs]
; Tao san cac thu muc luu tru trong %LocalAppData% de ung dung tu do doc ghi khong bi loi permission
Name: "{app}\backend\outputs"
Name: "{app}\backend\outputs\translate"
Name: "{app}\backend\outputs\captions"
Name: "{app}\backend\outputs\audios"
Name: "{app}\backend\outputs\alignment"
Name: "{app}\backend\outputs\dubbing"
Name: "{app}\logs"
Name: "{app}\backend\logs"

[Icons]
; Tao Shortcut ngoai Desktop va Start Menu tro thang vao file VideoTranslate AI.exe
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\assets\app.ico"; Tasks: desktopicon; Comment: "Khoi dong {#MyAppName} - OmniVoice Studio"
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\assets\app.ico"
Name: "{group}\Go cai dat {#MyAppName}"; Filename: "{uninstallexe}"

[Run]
; Tuy chon khoi chay ung dung ngay sau khi cai dat xong
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: postinstall nowait skipifsilent
