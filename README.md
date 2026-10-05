# Paris Photo Spots

Bản đồ các điểm chụp ảnh du lịch ở Paris và vùng lân cận (Île-de-France, Giverny): 8 loại góc chụp
(kiến trúc, đường phố, hoàng hôn/skyline, cầu & sông Seine, công viên, rooftop, cưới/pre-wedding, ngoại ô),
ảnh bìa từ Wikimedia Commons, mức đông ước tính theo giờ, thời tiết, và ảnh do người dùng đóng góp.

Giao diện: tiếng Việt (mặc định), English, Français.

## Stack

- **Frontend**: React 19 + TypeScript + Vite, `@vis.gl/react-maplibre` (MapLibre GL), React Router, TanStack Query
- **Backend**: Node.js ≥ 22, Express 5 + TypeScript, `pg`, Zod, multer + sharp
- **Database**: PostgreSQL 17 + PostGIS 3.4 (Docker)
- **Dữ liệu mở**: OpenStreetMap (Overpass), Wikidata, Wikimedia Commons, Muséofile, IDFM, Paris Open Data

## Chạy local

```bash
npm install
npm run db:up                          # PostGIS qua Docker (cổng 5433)
cp backend/.env.example backend/.env
npm run migrate:up -w backend
npm run import -w backend -- --refresh # tải dữ liệu mở và chọn photo spot (vài phút)
npm run dev:backend                    # http://localhost:3000
npm run dev:frontend                   # http://localhost:5173
```

Kiểm tra: `npm run lint`, `npm run typecheck`, `npm test` (unit), `npm run test:integration` (cần Docker), `npm run build -w frontend`.

## Lưu ý

- Chưa có đăng nhập: các API ghi (tạo spot, tải ảnh) chỉ được giới hạn tần suất theo IP. Không nên mở công khai
  trước khi có xác thực và kiểm duyệt.
- Ảnh tải lên được nén lại và **bỏ toàn bộ metadata** (kể cả GPS) trước khi lưu.
- Ảnh bìa thuộc tác giả trên Wikimedia Commons, license ghi kèm từng ảnh. Dữ liệu bản đồ © OpenStreetMap contributors.
