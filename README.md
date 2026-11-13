# MyDM 0.1 cho Windows

Mã nguồn bản thử nghiệm có giao diện React, desktop Tauri 2, engine Rust, SQLite, native host và extension Chrome MV3. Không có phần thanh toán. ZIP là source, chưa kèm EXE đã biên dịch trên Windows. Đây chưa phải bản thay thế toàn bộ IDM.

## 1. Chuẩn bị Windows 11

Cài Rust stable MSVC bằng rustup tại https://rust-lang.org/tools/install/ ; Visual Studio Build Tools với workload **Desktop development with C++** và Windows SDK; Node.js LTS; Microsoft Edge WebView2 Runtime. Xem https://v2.tauri.app/start/prerequisites/ . Khi installer Rust hỏi, chọn cấu hình mặc định MSVC. Mở PowerShell mới sau cài đặt.

Kiểm tra:
```powershell
rustc --version
cargo --version
node --version
npm --version
```
Giải nén vào `C:\Dev\MyDM`, mở thư mục trong VS Code. Trong các lệnh dưới, thư mục này là gốc chứa Cargo.toml và README.md. Nếu PowerShell chặn npm.ps1, thay `npm` bằng `npm.cmd` hoặc dùng lệnh chạy script với ExecutionPolicy Bypass bên dưới; không cần đổi chính sách toàn máy.

## 2. Chạy phần mềm khi lập trình

Mở PowerShell tại gốc dự án:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev.ps1
```
Script cài dependency đúng package-lock.json và chạy Tauri. Lần đầu Cargo cần tải và biên dịch thư viện; chờ đến khi cửa sổ MyDM hiện ra. Cần Internet trong lần cài đầu. Không chỉ mở index.html vì phần tải chạy trong Rust.

Cách chạy thủ công tương đương:
```powershell
cd apps\desktop
npm ci
npm run tauri -- dev
```
Vào Cài đặt, chọn đường dẫn tuyệt đối như `D:\Downloads\MyDM`; chọn 1–6 file đồng thời, 1–8 kết nối/file, giới hạn KB/s mỗi file (0 là không giới hạn). Lưu trước khi thêm tác vụ. Dán URL HTTP/HTTPS và tên file nếu muốn, bấm Thêm tải xuống. Giữ cửa sổ mở. Đóng cửa sổ sẽ dừng tiến trình; mở lại, tác vụ đang chạy được chuyển sang Tạm dừng, bấm Tiếp tục. Chỉ mở một instance.

## 3. Tạo file EXE

Từ PowerShell tại gốc dự án:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build.ps1
```
Kết quả dự kiến sau khi build thành công:
- `release\MyDM\mydm.exe`: ứng dụng desktop.
- `release\MyDM\mydm-native-host.exe`: cầu nối Chrome.
- `release\MyDM\chrome-extension\`: tiện ích Chrome.
- Hai script đăng ký/gỡ host và README.

Đây là gói portable, chưa có installer MSI/NSIS và chưa ký số. Máy chạy cần WebView2 Runtime. Lần sau mở mydm.exe trực tiếp, không cần chạy npm. Giữ nguyên vị trí EXE native host sau khi đăng ký; nếu chuyển thư mục phải đăng ký lại. Đường dẫn build nguyên bản là `target\release\mydm.exe` và `target\release\mydm-native-host.exe`; build script sao chép chúng vào release.

## 4. Cấu hình bắt link trên Chrome

Sau khi build, mở `chrome://extensions`, bật **Chế độ dành cho nhà phát triển**, chọn **Tải tiện ích đã giải nén** và trỏ tới `release\MyDM\chrome-extension`. Sao chép ID tiện ích (32 ký tự a–p).

Tại gốc dự án chạy, thay chuỗi trong ngoặc kép bằng ID thật:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\release\MyDM\install-host.ps1 -ExtensionId "ID_TIEN_ICH_CUA_BAN"
```
Không dùng nguyên giá trị minh họa: script kiểm tra ID và sẽ từ chối. Script chỉ đăng ký host cho tài khoản Windows hiện tại, không cần chạy Administrator. Nó ghi manifest tại `%LOCALAPPDATA%\MyDM\ChromeHost` và registry `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.mydm.host`.

Mở MyDM; bấm biểu tượng extension → **Kiểm tra kết nối**. Thông báo “Native host hoạt động” chỉ xác nhận bridge, không xác nhận desktop đã mở. Trên một link tải công khai, bấm chuột phải → **Tải link bằng MyDM**. File xuất hiện trong ứng dụng sau khoảng 1 giây. Nếu MyDM chưa mở, tác vụ vẫn lưu trong hàng đợi và chạy khi mở ứng dụng.

Để tự chuyển download: trong popup bật **Tự chuyển lượt tải**, nhập các tên miền chính xác như `example.com, cdn.example.com`, bấm Lưu. Chỉ nhập hostname, không nhập https:// hay đường dẫn. Trường hợp redirect sang CDN phải thêm hostname cuối. Chức năng tự động mặc định tắt và chỉ áp dụng các domain đã chọn. MyDM tạo tác vụ Chờ xác nhận, Chrome hủy lượt tải, rồi bridge cho tác vụ MyDM chạy. Nếu Chrome đã tải xong thì tác vụ MyDM bị hủy để hạn chế trùng.

Không bật tự chuyển cho link dùng một lần, yêu cầu đăng nhập, POST, blob, data hoặc website có DRM. Bản này không lấy cookie, Authorization hay request body từ Chrome. Một URL chuyển thành công vẫn có thể bị máy chủ từ chối khi Rust tải. Tắt tự chuyển rồi tải lại bằng Chrome nếu gặp trường hợp đó. Nếu Chrome đã dừng nhưng bước xác nhận cuối bị lỗi, mở MyDM và bấm Tiếp tục cho tác vụ Chờ xác nhận Chrome; kiểm tra popup để biết trạng thái. API Chrome không cung cấp giao dịch nguyên tử giữa hai ứng dụng nên vẫn có thể có tác vụ chờ/trùng khi extension bị dừng đột ngột.

Đăng ký host cho chế độ dev (không bắt buộc build desktop release):
```powershell
cargo build -p mydm-native-host --locked
powershell -NoProfile -ExecutionPolicy Bypass -File .\packaging\windows\install-host.ps1 -ExtensionId "ID_TIEN_ICH_CUA_BAN" -HostExe .\target\debug\mydm-native-host.exe
```
Load unpacked từ `apps\chrome-extension`; giữ `npm run tauri -- dev` chạy. Không đăng ký cả hai bản extension cùng lúc; manifest hiện cho phép một ID.

## 5. Sử dụng và lưu dữ liệu

Tạm dừng giữ các file part; Tiếp tục chỉ nối phần còn thiếu khi server có strong ETag và HTTP Range hợp lệ. Nếu không đủ điều kiện, tác vụ dùng một kết nối và tải lại từ đầu khi tiếp tục; không ghép file không xác minh được. Tải lại từ đầu cần xác nhận và xóa phần tải dở. Hủy giữ phần tải dở; Xóa lịch sử xóa cả part nhưng giữ file đã hoàn tất. Mở thư mục không tự thực thi file.

Metadata và file part nằm ở `%LOCALAPPDATA%\MyDM`; file hoàn tất nằm ở thư mục đã chọn. Khi ghép file cần thêm dung lượng gần bằng kích thước file; sau khi ghi trạng thái hoàn tất, part được dọn. Không chỉnh/xóa SQLite khi ứng dụng hoặc bridge đang dùng. URL được lưu cục bộ trong lịch sử và có thể chứa token: không chia sẻ DB; xóa lịch sử khi không cần.

## 6. Kiểm thử

```powershell
cargo test -p mydm-engine -p mydm-native-host --locked
cargo build -p mydm-engine --example smoke --locked
py tests\run_smoke.py
node --test tests\chrome_bridge.test.cjs
```
Python 3 chỉ cần cho test, không cần để chạy ứng dụng. Để thử bằng giao diện, chạy `py tests\http_fixture.py`, thêm URL `http://127.0.0.1:8765/slow`. File chuẩn có 16 MiB; thử pause/resume. Với Chrome, thêm domain `127.0.0.1`, truy cập URL `/range`; trường hợp Chrome chỉ hiển thị nội dung thay vì download hãy dùng menu tải link.

Đã kiểm tra trong môi trường phát triển: Rust core/native host compile, unit tests, HTTP thực với hash, bridge bằng mock Chrome và TypeScript/Vite build. Chưa chạy GUI/Chrome thật hoặc tạo EXE trên Windows trong phiên bàn giao này. Xem `docs/verification.md`.

## 7. Lỗi thường gặp

`link.exe not found`: cài workload C++ và Windows SDK, mở terminal mới. Thiếu WebView2: cài WebView2 Runtime. `Native host not found`: kiểm tra registry, ID, đường dẫn EXE; đăng ký lại và reload extension. `Access forbidden`: ID không khớp allowed_origins. Có task nhưng không tải: mở desktop, kiểm tra trạng thái Held/Paused, thư mục và mạng. `Range hoặc ETag thay đổi`: chọn Tải lại từ đầu. Đợi lâu khi tạm dừng: yêu cầu mạng đang block; có timeout tối đa 600 giây/request. Không xóa file part khi ứng dụng đang chạy.

Gỡ bridge:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\release\MyDM\uninstall-host.ps1
```
Sau đó gỡ extension trong Chrome. Script không xóa lịch sử hay file tải.
