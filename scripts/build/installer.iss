; Script Inno Setup 7.x - Dong goi VideoTranslate AI Desktop App (Electron + Standalone AI Runtime)
; Tac gia: Tran Van Kha
; Phien ban: 3.13.0

#define MyAppName "VideoTranslate AI"
#define MyAppVersion "3.13.0"
#define MyAppPublisher "Tran Van Kha"
#define MyAppURL "https://github.com/tranvankha1989/TranslateVideo"
#define MyAppExeName "VideoTranslate AI.exe"

; CAI DAT TU DO 1-CLICK: Khong yeu cau mat khau cai dat. Quan ly ban quyen bang HWID Ed25519 trong app.

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

; KHONG DOI QUYEN ADMIN: Cai dat vao %LocalAppData% giup toan quyen ghi file ma khong can UAC
PrivilegesRequired=lowest
DefaultDirName={localappdata}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes

; Duong dan output va icon
OutputDir=..\..\installer_output
OutputBaseFilename=VideoTranslateAI_v{#MyAppVersion}_Setup
SetupIconFile=..\..\assets\app.ico
UninstallDisplayIcon={app}\assets\app.ico

; Che do nen toi uu hoa toc do sieu toc (Nhanh hon gap 4 - 6 lan, tan dung da luong CPU 12-core)
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
; 1. Electron Native Desktop App Binaries (File .exe chuan khong lo Antivirus chan)
Source: "..\..\frontend\release\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; 2. Frontend Dist Build (Static web files cho FastAPI Backend phuc vu)
Source: "..\..\frontend\dist\*"; DestDir: "{app}\frontend\dist"; Flags: ignoreversion recursesubdirs createallsubdirs

; 3. Assets & App Icons
Source: "..\..\assets\*"; DestDir: "{app}\assets"; Flags: ignoreversion recursesubdirs createallsubdirs

; 3. Binaries noi bo FFmpeg (ffmpeg.exe, ffprobe.exe)
Source: "..\..\bin\*"; DestDir: "{app}\bin"; Flags: ignoreversion recursesubdirs createallsubdirs

; 4. Python Embeddable Runtime (Doc lap 100%, khong can may khach cai Python)
Source: "..\..\python_runtime\*"; DestDir: "{app}\python_runtime"; Flags: ignoreversion recursesubdirs createallsubdirs

; 5. Backend Compiled Bytecode (Bao ve chong dich nguoc: Ma hoa sang .pyc bytecode, khong chua file .py)
Source: "..\..\build_staging\backend\*"; DestDir: "{app}\backend"; Flags: ignoreversion recursesubdirs createallsubdirs

; 6. File thong tin phien ban Version
Source: "..\..\version.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\version.json"; DestDir: "{app}\backend"; Flags: ignoreversion

[InstallDelete]
; Tu dong don dep cac file ma nguon .py cu tranh viec Python uu tien import file .py cu thay vi bytecode .pyc moi nhat
Type: files; Name: "{app}\backend\*.py"
Type: filesandordirs; Name: "{app}\backend\app"


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


