# 🌐 Panduan Lengkap Deploy & Pasang Domain Sendiri (.com / .id / .my.id)

Dokumen ini menjelaskan langkah demi langkah cara mempublikasikan aplikasi **Share Otomatis WA** ke internet 24 jam nonstop dan menghubungkan domain pribadi Anda (misalnya `wa.domainanda.com` atau `domainanda.com`).

---

## ⚠️ Catatan Sangat Penting Mengenai Bot WhatsApp & Vercel

> [!WARNING]
> **Mengapa Vercel kurang cocok untuk WhatsApp Bot?**
> - **Vercel berbasis Serverless**: Serverless function akan otomatis mati (*freeze/sleep*) jika tidak ada pengunjung dalam hitungan menit.
> - **Kebutuhan Bot WhatsApp**: Baileys membutuhkan koneksi WebSocket yang **standby 24 jam** dan penyimpanan file sesi login (`.baileys_auth/`) yang permanen agar bot tidak logout sendiri dan jadwal otomatis tetap terkirim saat tengah malam.
> 
> **Rekomendasi Hosting Terbaik**:
> 1. **VPS (Virtual Private Server) - Paling Direkomendasikan**: Biaya sangat terjangkau (Rp 30.000 – Rp 50.000/bulan di IDCloudHost, DomaiNesia, Biznet, Niagahoster, atau DigitalOcean). WhatsApp aktif 24 jam nonstop dan bebas pakai domain sendiri.
> 2. **PaaS (Railway.app / Render.com)**: Platform cloud modern berbasis container yang mendukung Node.js 24 jam + persistent disk + custom domain.

---

## 🛠️ OPSI 1: Deploy di VPS dengan Domain Sendiri (Rekomendasi Utama)

### 1. Beli Domain
Anda bisa membeli domain seperti `.com`, `.id`, atau `.my.id` (biasanya `.my.id` hanya Rp 12.000/tahun di Niagahoster / DomaiNesia / Rumahweb).

### 2. Atur DNS Domain
Masuk ke panel DNS penyedia domain Anda (atau Cloudflare jika pakai Cloudflare), lalu tambahkan **DNS Record**:

| Tipe | Nama (Host) | Nilai / Isi (Value) | TTL |
|---|---|---|---|
| **A** | `@` (untuk domain utama) | `IP_VPS_ANDA` (misal: `103.180.xxx.xxx`) | Auto / 3600 |
| **A** | `wa` (jika ingin subdomain `wa.domainanda.com`) | `IP_VPS_ANDA` | Auto / 3600 |

---

### 3. Setup Aplikasi di VPS (Hanya 3 Langkah)

Buka terminal SSH VPS Anda (menggunakan PuTTY atau Command Prompt `ssh root@IP_VPS_ANDA`):

#### Langkah A: Install Node.js & PM2
```bash
# Update sistem
sudo apt update && sudo apt upgrade -y

# Install Node.js v20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx git

# Install PM2 (Process Manager agar aplikasi berjalan 24 jam di background)
sudo npm install -g pm2
```

#### Langkah B: Upload / Copy Project ke VPS
Anda bisa upload folder project ini ke folder `/var/www/share-otomatis` di VPS:
```bash
cd /var/www/share-otomatis

# Install dependensi & build aplikasi
npm install
npm run build

# Jalankan dengan PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```
*Aplikasi Anda sekarang sudah berjalan aktif 24 jam di port 3005!*

#### Langkah C: Konfigurasi Nginx & Pasang SSL HTTPS Gratis
Buat file konfigurasi Nginx:
```bash
sudo nano /etc/nginx/sites-available/share-otomatis
```
Tempelkan konfigurasi berikut (ganti `domainanda.com` dengan domain Anda):
```nginx
server {
    server_name domainanda.com wa.domainanda.com;

    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Batas upload file jadwal (sampai 50MB)
        client_max_body_size 50M;
    }
}
```
Aktifkan dan restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/share-otomatis /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

Pasang SSL HTTPS gratis (Let's Encrypt):
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d domainanda.com -d wa.domainanda.com
```

✅ **Selesai!** Sekarang aplikasi Share Otomatis WA Anda bisa diakses secara aman di `https://domainanda.com` atau `https://wa.domainanda.com`!

---

## 🚀 OPSI 2: Deploy Cepat via Railway.app (Tanpa Kelola Server)

1. Buka [Railway.app](https://railway.app) dan login dengan akun GitHub Anda.
2. Buat repository baru di GitHub dan upload folder project ini.
3. Di Railway, klik **New Project** &rarr; **Deploy from GitHub repo** &rarr; Pilih repository Anda.
4. Tambahkan **Volume (Persistent Storage)** di menu Settings &rarr; Mount path: `/app/data` dan `/app/.baileys_auth`.
5. Masuk ke tab **Settings** &rarr; **Networking**:
   - Anda akan mendapatkan domain bawaan gratis (misal: `share-otomatis.up.railway.app`).
   - Klik **Custom Domain** untuk memasukkan domain sendiri (`wa.domainanda.com`), lalu ikuti petunjuk DNS CNAME yang ditampilkan.

---

## ⚡ File Penunjang yang Sudah Disiapkan di Project Ini

- [`Dockerfile`](file:///c:/M.KHOLID%20SYAIFULLOH/KHOLID/Share%20Otomatis/Dockerfile) : Konfigurasi container Docker production.
- [`docker-compose.yml`](file:///c:/M.KHOLID%20SYAIFULLOH/KHOLID/Share%20Otomatis/docker-compose.yml) : Menjalankan aplikasi dengan penyimpanan permanen dalam 1 perintah (`docker compose up -d`).
- [`ecosystem.config.js`](file:///c:/M.KHOLID%20SYAIFULLOH/KHOLID/Share%20Otomatis/ecosystem.config.js) : Konfigurasi otomatis untuk PM2 di VPS.
