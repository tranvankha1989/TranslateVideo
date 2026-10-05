; Script Inno Setup 7.x - Dong goi VideoTranslate AI Desktop App (Electron + Standalone AI Runtime)
; Tac gia: Tran Van Kha
; Phien ban: 3.10.0

#define MyAppName "VideoTranslate AI"
#define MyAppVersion "3.10.0"
#define MyAppPublisher "Tran Van Kha"
#define MyAppURL "https://github.com/tranvankha1989/TranslateVideo"
#define MyAppExeName "VideoTranslate AI.exe"

; MAT KHAU / KEY CAI DAT: Tu dong tinh toan theo ngay theo thuat toan (x mod 4) + 1
; Vi du: 05/10/2026 -> 12213133

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

; 2. Frontend Dist Build (Static web files cho FastAPI Backend phuc vu)
Source: "..\frontend\dist\*"; DestDir: "{app}\frontend\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\frontend\dist\*"; DestDir: "{app}\dist"; Flags: ignoreversion recursesubdirs createallsubdirs

; 3. Assets & App Icons
Source: "..\assets\*"; DestDir: "{app}\assets"; Flags: ignoreversion recursesubdirs createallsubdirs

; 3. Binaries noi bo FFmpeg (ffmpeg.exe, ffprobe.exe)
Source: "..\bin\*"; DestDir: "{app}\bin"; Flags: ignoreversion recursesubdirs createallsubdirs

; 4. Python Embeddable Runtime (Doc lap 100%, khong can may khach cai Python)
Source: "..\python_runtime\*"; DestDir: "{app}\python_runtime"; Flags: ignoreversion recursesubdirs createallsubdirs

; 5. Backend Compiled Bytecode (Bao ve chong dich nguoc: Ma hoa sang .pyc bytecode, khong chua file .py)
Source: "..\build_staging\backend\*"; DestDir: "{app}\backend"; Flags: ignoreversion recursesubdirs createallsubdirs

; 6. File thong tin phien ban Version
Source: "..\version.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\version.json"; DestDir: "{app}\backend"; Flags: ignoreversion

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

[Code]
var
  FailedCount: Integer;

// Ham kiem tra mat khau cai dat tu dong theo ngay
// Thuat toan: Voi moi chu so x trong ddmmyyyy -> Chu so = (x mod 4) + 1
function CheckPassword(Password: String): Boolean;
var
  DateStr, ExpectedKey: String;
  i, digitVal, modVal: Integer;
begin
  // Lay chuoi ngay thang hien tai tu dong ho he thong (dinh dang: ddmmyyyy, VD: 05102026)
  DateStr := GetDateTimeString('ddmmyyyy', #0, #0);
  ExpectedKey := '';

  for i := 1 to Length(DateStr) do
  begin
    digitVal := Ord(DateStr[i]) - Ord('0');
    if (digitVal >= 0) and (digitVal <= 9) then
    begin
      modVal := (digitVal mod 4) + 1;
      ExpectedKey := ExpectedKey + IntToStr(modVal);
    end;
  end;

  // So sanh voi mat khau dong theo ngay HOAC Master Key chu (Aimabiet)
  if (Trim(Password) = ExpectedKey) or (Trim(Password) = 'Aimabiet') then
  begin
    Result := True;
  end
  else
  begin
    FailedCount := FailedCount + 1;
    if FailedCount >= 5 then
    begin
      MsgBox('Ban da nhap sai mat khau qua 5 lan!' + #13#10 + 
             'Trinh cai dat se tu dong dong de bao mat.', mbCriticalError, MB_OK);
      WizardForm.Close;
    end
    else
    begin
      MsgBox('Mat khau cai dat khong dung hoac da het han trong ngay!' + #13#10 + 
             'Vui long kiem tra lai ma ngay hom nay.' + #13#10 + 
             '(Con ' + IntToStr(5 - FailedCount) + ' lan thu)', mbError, MB_OK);
    end;
    Result := False;
  end;
end;
