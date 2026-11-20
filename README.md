# Nhật ký cha & con — Mã nguồn

Ứng dụng dành cho Sushi và cha, gồm lịch nhiệm vụ, xúc xắc phép nhân, góc vẽ và vòng quay quà.

## Các tệp chính

- `index.html`: trang đã đóng gói sẵn, có thể mở trực tiếp mà không cần tải thư viện từ mạng.
- `app.jsx`: mã nguồn React của giao diện và tương tác.
- `styles.css`: giao diện, bố cục đáp ứng điện thoại/máy tính bảng.
- `physics.js`: bộ vật lý, CSS 3D và canvas; đã bao gồm bản đóng gói của thư viện `cannon-es`.
- `server.js`: máy chủ Node.js không cần thư viện phụ trợ, cung cấp API và đồng bộ giữa các thiết bị.
- `build.js`: biên dịch `app.jsx` và nhúng mã, CSS, vật lý vào `index.html`.
- `package.json`, `package-lock.json`: thông tin các thư viện dùng để biên dịch.

## Mở nhanh trên một thiết bị

Mở `index.html` bằng trình duyệt. Dữ liệu lưu trên thiết bị/trình duyệt đó; file mở trực tiếp không tự đồng bộ sang thiết bị khác. Một số chế độ xem nhúng có thể không cho lưu dữ liệu hoặc tải tranh, nên hãy mở trực tiếp trong trình duyệt để sử dụng lâu dài.

## Chạy máy chủ đồng bộ

Cần Node.js 18 trở lên. Trong thư mục dự án, chạy:

```bash
node server.js
```

Trên cùng máy, vào `http://localhost:3000`. Hai thiết bị phải cùng truy cập được địa chỉ của **cùng một máy chủ**; ví dụ khi cùng mạng nội bộ có thể dùng `http://DIA_CHI_IP_MAY_CHU:3000`. Địa chỉ cụ thể phụ thuộc mạng và cấu hình tường lửa. Để sử dụng từ xa cần tự triển khai và cấu hình truy cập an toàn; dự án này không tự tạo đường dẫn Internet cố định.

Vào **Góc của cha** để đăng nhập. PIN mặc định là `1234`; hãy đổi ngay. Có thể đặt PIN ban đầu qua biến môi trường `DIARY_PIN` trước lần chạy đầu tiên. Sau khi máy chủ đã tạo `data/auth.json`, PIN được lưu trong tệp đó và cần đổi qua giao diện.

Máy chủ lưu trạng thái và bản ghi âm trong `data/`. Thư mục này không nằm trong gói mã nguồn; máy chủ sẽ tự tạo. Hãy sao lưu dữ liệu riêng nếu cần.

**Bảo mật:** Đây là máy chủ thử nghiệm cho gia đình, không phải hệ thống bảo mật hoàn chỉnh. Ai truy cập được đường dẫn máy chủ cũng có thể đọc nhật ký và thực hiện các thao tác ở trang con; PIN chỉ bảo vệ các thao tác quản trị. Không đưa trực tiếp lên Internet công khai khi chưa bổ sung xác thực truy cập, HTTPS, bảo vệ chống dò PIN và các biện pháp bảo mật phù hợp.

**Ghi âm:** Trình duyệt thường yêu cầu HTTPS hoặc localhost và quyền dùng microphone. Truy cập bằng địa chỉ IP qua HTTP trên thiết bị khác có thể không ghi âm được. Trình xem nhúng cũng có thể chặn microphone.

**Góc vẽ:** Tranh lưu trên thiết bị/trình duyệt vẽ, không tự gửi hoặc đồng bộ cho cha. Có nút tải tranh PNG; việc tải xuống có thể bị chặn trong trình xem nhúng.

## Chỉnh sửa và biên dịch lại

Sau khi cài Node.js, chạy trong thư mục dự án:

```bash
npm ci
npm run build
```

Lệnh trên tạo lại `index.html` từ `app.jsx`, `styles.css` và `physics.js`, bao gồm React và các thư viện giao diện trong trang. Không cần chạy lệnh này nếu chỉ muốn dùng `index.html` đã có sẵn. Sau đó chạy `node server.js` nếu cần đồng bộ.

Thư viện bên thứ ba được sử dụng gồm React, React DOM, react-kawaii và cannon-es; xem giấy phép tương ứng trong các gói thư viện khi phân phối lại.
