"""
tools/keygen_gui.py
===================
Ứng dụng Desktop Độc Lập Quản Trị & Cấp Mã Bản Quyền (VideoTranslate AI).
- Giao diện trực quan (Tkinter Dark Mode hiện đại)
- Hoạt động 100% độc lập, không cần khởi động backend hay web app
- Bảo mật thông tin kỹ thuật, không làm lộ cơ chế mã hóa ra giao diện
- Tự động lưu trữ và quản lý danh sách key (tools/issued_licenses.json)
- Hỗ trợ: Sắp xếp theo cột, đánh dấu đã gửi khách, tự động dọn dẹp key hết hạn
"""

import os
import sys
import json
import uuid
import tkinter as tk
from tkinter import ttk, messagebox, filedialog
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Đảm bảo import được module trong tools/
if getattr(sys, "frozen", False):
    TOOLS_DIR = Path(sys.executable).resolve().parent
    PROJECT_DIR = TOOLS_DIR
else:
    TOOLS_DIR = Path(__file__).resolve().parent
    PROJECT_DIR = TOOLS_DIR.parent

if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

# Nạp module mật mã từ keygen_cli
try:
    from keygen_cli import (
        ensure_keypair,
        issue_license,
        verify_license,
        DEFAULT_FEATURES,
    )
except ImportError as err:
    messagebox.showerror(
        "Thiếu thư viện",
        f"Không tìm thấy thư viện 'cryptography'.\nVui lòng cài đặt: pip install cryptography\n\nChi tiết: {err}"
    )
    sys.exit(1)

ISSUED_LICENSES_FILE = TOOLS_DIR / "issued_licenses.json"

# Bảng màu Dark Mode phong cách Sleek Slate & Emerald
THEME = {
    "bg": "#0f172a",          # Slate 900
    "card_bg": "#1e293b",     # Slate 800
    "card_border": "#334155", # Slate 700
    "input_bg": "#090d16",    # Slate 950
    "input_fg": "#f8fafc",    # Slate 50
    "text_main": "#f8fafc",   # Slate 50
    "text_muted": "#94a3b8",  # Slate 400
    "accent_blue": "#3b82f6", # Blue 500
    "accent_green": "#10b981",# Emerald 500
    "accent_amber": "#f59e0b",# Amber 500
    "accent_red": "#ef4444",  # Red 500
    "btn_text": "#ffffff",
}


class KeygenAdminApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("KeyGen VideoTranslateAI")
        self.geometry("1200x850")
        self.minsize(1080, 780)
        self.configure(bg=THEME["bg"])

        # Thiết lập Icon nếu có
        icon_path = TOOLS_DIR / "license-key-icon.ico"
        if not icon_path.exists():
            icon_path = PROJECT_DIR / "assets" / "license-key-icon.ico"
        if not icon_path.exists():
            icon_path = TOOLS_DIR / "keygen.ico"
        if not icon_path.exists():
            icon_path = PROJECT_DIR / "assets" / "keygen.ico"
        if not icon_path.exists():
            icon_path = TOOLS_DIR / "app.ico"
        if not icon_path.exists():
            icon_path = PROJECT_DIR / "assets" / "app.ico"
        if icon_path.exists():
            try:
                self.iconbitmap(str(icon_path))
            except Exception:
                pass

        # Đảm bảo khóa bảo mật sẵn sàng
        try:
            ensure_keypair()
        except Exception as e:
            messagebox.showerror("Lỗi Khởi Tạo", f"Không thể tải hoặc tạo cấu hình bảo mật: {e}")

        # Trạng thái sắp xếp cột
        self.sort_directions = {}
        self.active_filter = "ALL"

        self._init_styles()
        self._build_ui()
        self._load_licenses_data()

    def _init_styles(self):
        style = ttk.Style(self)
        style.theme_use("clam")

        # Notebook (Tabs)
        style.configure(
            "TNotebook",
            background=THEME["bg"],
            borderwidth=0,
            tabmargins=[10, 10, 10, 0],
        )
        style.configure(
            "TNotebook.Tab",
            background=THEME["card_bg"],
            foreground=THEME["text_muted"],
            font=("Segoe UI", 10, "bold"),
            padding=[18, 9],
            borderwidth=0,
        )
        style.map(
            "TNotebook.Tab",
            background=[("selected", THEME["accent_blue"]), ("active", "#2563eb")],
            foreground=[("selected", "#ffffff"), ("active", "#ffffff")],
        )

        # Treeview (Bảng lịch sử)
        style.configure(
            "Treeview",
            background=THEME["card_bg"],
            foreground=THEME["text_main"],
            fieldbackground=THEME["card_bg"],
            font=("Segoe UI", 9),
            rowheight=32,
            borderwidth=0,
        )
        style.configure(
            "Treeview.Heading",
            background="#0f172a",
            foreground=THEME["text_muted"],
            font=("Segoe UI", 9, "bold"),
            padding=[8, 8],
            borderwidth=1,
            relief="flat",
        )
        style.map(
            "Treeview",
            background=[("selected", THEME["accent_blue"])],
            foreground=[("selected", "#ffffff")],
        )

    def _build_ui(self):
        # Header Banner (Ẩn hoàn toàn thông tin thuật toán/công nghệ nhạy cảm)
        header = tk.Frame(self, bg=THEME["card_bg"], height=62)
        header.pack(fill="x", side="top")
        header.pack_propagate(False)

        title_lbl = tk.Label(
            header,
            text="⚡ VideoTranslate AI — Bộ Quản Trị & Cấp Bản Quyền Nội Bộ",
            font=("Segoe UI", 13, "bold"),
            bg=THEME["card_bg"],
            fg=THEME["text_main"],
        )
        title_lbl.pack(side="left", padx=20, pady=14)

        status_lbl = tk.Label(
            header,
            text="🛡️ Chế độ: Quản trị viên (Ngoại tuyến)",
            font=("Segoe UI", 9, "bold"),
            bg=THEME["card_bg"],
            fg=THEME["accent_green"],
        )
        status_lbl.pack(side="right", padx=20, pady=14)

        # Tab Control
        self.notebook = ttk.Notebook(self)
        self.notebook.pack(fill="both", expand=True, padx=12, pady=12)

        # Tab 1: Tạo Key Mới
        self.tab_generate = tk.Frame(self.notebook, bg=THEME["bg"])
        self.notebook.add(self.tab_generate, text="  ➕ Cấp Key Bản Quyền  ")
        self._build_generate_tab()

        # Tab 2: Lịch Sử & Quản Lý
        self.tab_history = tk.Frame(self.notebook, bg=THEME["bg"])
        self.notebook.add(self.tab_history, text="  📋 Lịch Sử & Danh Sách Key  ")
        self._build_history_tab()

    # ──────────────────────────────────────────────────────────────────────────
    # TAB 1: FORM CẤP KEY
    # ──────────────────────────────────────────────────────────────────────────
    def _build_generate_tab(self):
        main_frame = tk.Frame(self.tab_generate, bg=THEME["bg"])
        main_frame.pack(fill="both", expand=True, padx=16, pady=12)

        # Cột Trái: Nhập Liệu
        left_card = tk.LabelFrame(
            main_frame,
            text=" 📝 Thông Tin Khách Hàng & Gói Cước ",
            font=("Segoe UI", 10, "bold"),
            bg=THEME["card_bg"],
            fg=THEME["accent_blue"],
            padx=16,
            pady=14,
            relief="solid",
            bd=1,
        )
        left_card.pack(side="left", fill="both", expand=True, padx=(0, 10))

        # 1. HWID
        tk.Label(
            left_card,
            text="Mã Máy Khách Hàng (HWID) *",
            font=("Segoe UI", 9, "bold"),
            bg=THEME["card_bg"],
            fg=THEME["text_main"],
        ).pack(anchor="w")

        hwid_row = tk.Frame(left_card, bg=THEME["card_bg"])
        hwid_row.pack(fill="x", pady=(4, 12))

        self.hwid_entry = tk.Entry(
            hwid_row,
            font=("Consolas", 10),
            bg=THEME["input_bg"],
            fg=THEME["input_fg"],
            insertbackground="white",
            relief="flat",
            bd=5,
        )
        self.hwid_entry.pack(side="left", fill="x", expand=True)

        paste_btn = tk.Button(
            hwid_row,
            text="📋 Dán (Paste)",
            font=("Segoe UI", 9),
            bg=THEME["card_border"],
            fg=THEME["text_main"],
            activebackground=THEME["accent_blue"],
            activeforeground="#fff",
            relief="flat",
            padx=10,
            cursor="hand2",
            command=self._paste_hwid,
        )
        paste_btn.pack(side="left", padx=(8, 0))

        # 2. Tên Khách Hàng
        tk.Label(
            left_card,
            text="Tên Khách Hàng / Ghi Chú",
            font=("Segoe UI", 9, "bold"),
            bg=THEME["card_bg"],
            fg=THEME["text_main"],
        ).pack(anchor="w")

        self.client_entry = tk.Entry(
            left_card,
            font=("Segoe UI", 10),
            bg=THEME["input_bg"],
            fg=THEME["input_fg"],
            insertbackground="white",
            relief="flat",
            bd=5,
        )
        self.client_entry.pack(fill="x", pady=(4, 12))

        # 3. Chọn Gói Thời Hạn
        tk.Label(
            left_card,
            text="Chọn Gói Thời Hạn *",
            font=("Segoe UI", 9, "bold"),
            bg=THEME["card_bg"],
            fg=THEME["text_main"],
        ).pack(anchor="w")

        self.duration_var = tk.StringVar(value="lifetime")
        plans_frame = tk.Frame(left_card, bg=THEME["card_bg"])
        plans_frame.pack(fill="x", pady=(4, 12))

        plans = [
            ("⭐ Vĩnh Viễn (Lifetime PRO)", "lifetime"),
            ("📅 1 Năm (365 Ngày)", "365"),
            ("📅 3 Tháng (90 Ngày)", "90"),
            ("📅 1 Tháng (30 Ngày)", "30"),
            ("⏳ Dùng Thử (7 Ngày)", "7"),
            ("⚙️ Tùy chỉnh số ngày", "custom"),
        ]

        for text, val in plans:
            rb = tk.Radiobutton(
                plans_frame,
                text=text,
                variable=self.duration_var,
                value=val,
                font=("Segoe UI", 9),
                bg=THEME["card_bg"],
                fg=THEME["text_main"],
                selectcolor=THEME["input_bg"],
                activebackground=THEME["card_bg"],
                activeforeground=THEME["accent_green"],
                command=self._on_duration_changed,
            )
            rb.pack(anchor="w", pady=2)

        # Ô nhập số ngày tùy chỉnh
        self.custom_days_row = tk.Frame(left_card, bg=THEME["card_bg"])
        tk.Label(
            self.custom_days_row,
            text="Nhập số ngày:",
            font=("Segoe UI", 9),
            bg=THEME["card_bg"],
            fg=THEME["text_muted"],
        ).pack(side="left")

        self.custom_days_entry = tk.Entry(
            self.custom_days_row,
            font=("Consolas", 10),
            width=8,
            bg=THEME["input_bg"],
            fg=THEME["input_fg"],
            insertbackground="white",
            relief="flat",
            bd=4,
        )
        self.custom_days_entry.pack(side="left", padx=8)
        self.custom_days_entry.insert(0, "60")

        # Nút Kích Hoạt Tạo Key
        gen_btn = tk.Button(
            left_card,
            text="⚡ TẠO MÃ BẢN QUYỀN NGAY",
            font=("Segoe UI", 10, "bold"),
            bg=THEME["accent_green"],
            fg="#ffffff",
            activebackground="#059669",
            activeforeground="#ffffff",
            relief="flat",
            pady=9,
            cursor="hand2",
            command=self._generate_license,
        )
        gen_btn.pack(fill="x", pady=(16, 0))

        # Cột Phải: Kết Quả & Mẫu Tin Nhắn
        right_card = tk.LabelFrame(
            main_frame,
            text=" 🎁 Kết Quả & Mẫu Tin Nhắn Gửi Khách ",
            font=("Segoe UI", 10, "bold"),
            bg=THEME["card_bg"],
            fg=THEME["accent_green"],
            padx=16,
            pady=14,
            relief="solid",
            bd=1,
        )
        right_card.pack(side="right", fill="both", expand=True)

        # Mã Key
        tk.Label(
            right_card,
            text="Mã Kích Hoạt (License Key):",
            font=("Segoe UI", 9, "bold"),
            bg=THEME["card_bg"],
            fg=THEME["text_main"],
        ).pack(anchor="w")

        self.key_box = tk.Text(
            right_card,
            font=("Consolas", 9),
            height=4,
            bg=THEME["input_bg"],
            fg="#38bdf8",
            insertbackground="white",
            relief="flat",
            bd=5,
            wrap="char",
        )
        self.key_box.pack(fill="x", pady=(4, 6))

        btn_row = tk.Frame(right_card, bg=THEME["card_bg"])
        btn_row.pack(fill="x", pady=(0, 10))

        copy_key_btn = tk.Button(
            btn_row,
            text="📋 Sao Chép Key",
            font=("Segoe UI", 9, "bold"),
            bg=THEME["accent_blue"],
            fg="#fff",
            activebackground="#2563eb",
            activeforeground="#fff",
            relief="flat",
            padx=12,
            pady=4,
            cursor="hand2",
            command=self._copy_key,
        )
        copy_key_btn.pack(side="left")

        self.copy_status_lbl = tk.Label(
            btn_row,
            text="",
            font=("Segoe UI", 9, "italic"),
            bg=THEME["card_bg"],
            fg=THEME["accent_green"],
        )
        self.copy_status_lbl.pack(side="left", padx=10)

        # Mẫu Tin Nhắn
        tk.Label(
            right_card,
            text="Mẫu Tin Nhắn Soạn Sẵn Gửi Cho Khách:",
            font=("Segoe UI", 9, "bold"),
            bg=THEME["card_bg"],
            fg=THEME["text_main"],
        ).pack(anchor="w", pady=(6, 0))

        self.msg_box = tk.Text(
            right_card,
            font=("Segoe UI", 9),
            bg=THEME["input_bg"],
            fg=THEME["input_fg"],
            insertbackground="white",
            relief="flat",
            bd=5,
            wrap="word",
        )
        self.msg_box.pack(fill="both", expand=True, pady=(4, 8))

        copy_msg_btn = tk.Button(
            right_card,
            text="💬 Sao Chép Toàn Bộ Tin Nhắn",
            font=("Segoe UI", 9, "bold"),
            bg=THEME["card_border"],
            fg=THEME["text_main"],
            activebackground=THEME["accent_blue"],
            activeforeground="#fff",
            relief="flat",
            pady=6,
            cursor="hand2",
            command=self._copy_message,
        )
        copy_msg_btn.pack(fill="x")

    def _on_duration_changed(self):
        if self.duration_var.get() == "custom":
            self.custom_days_row.pack(fill="x", pady=(0, 8))
        else:
            self.custom_days_row.pack_forget()

    def _paste_hwid(self):
        try:
            clipboard_text = self.clipboard_get().strip()
            self.hwid_entry.delete(0, tk.END)
            self.hwid_entry.insert(0, clipboard_text)
        except Exception:
            pass

    def _generate_license(self):
        hwid = self.hwid_entry.get().strip()
        client = self.client_entry.get().strip() or "Quý Khách"

        if not hwid:
            messagebox.showwarning("Thiếu Thông Tin", "Vui lòng nhập hoặc dán mã máy HWID của khách hàng!")
            self.hwid_entry.focus_set()
            return

        choice = self.duration_var.get()
        if choice == "lifetime":
            days = 0
            tier = "PRO"
            plan_name = "Vĩnh Viễn (Lifetime PRO)"
            expiry_str = "Vĩnh viễn (2099-12-31)"
            expiry_val = "2099-12-31"
        elif choice == "custom":
            try:
                days = int(self.custom_days_entry.get().strip())
                if days <= 0:
                    raise ValueError()
            except ValueError:
                messagebox.showerror("Số Ngày Không Hợp Lệ", "Vui lòng nhập một số nguyên dương cho số ngày sử dụng!")
                return
            tier = "PRO"
            plan_name = f"{days} Ngày"
            exp_date = datetime.now() + timedelta(days=days)
            expiry_str = exp_date.strftime("%d/%m/%Y")
            expiry_val = exp_date.strftime("%Y-%m-%d")
        else:
            days = int(choice)
            tier = "TRIAL" if days == 7 else "PRO"
            plan_name = f"{days} Ngày"
            exp_date = datetime.now() + timedelta(days=days)
            expiry_str = exp_date.strftime("%d/%m/%Y")
            expiry_val = exp_date.strftime("%Y-%m-%d")

        try:
            # Sinh mã bản quyền
            license_key = issue_license(
                hwid=hwid,
                days=days,
                tier=tier,
                features=DEFAULT_FEATURES,
                client_name=client,
            )

            # Lưu vào file issued_licenses.json (kèm cờ is_sent = False)
            new_record = {
                "id": f"lic_{uuid.uuid4().hex[:8]}",
                "license_key": license_key,
                "hwid": hwid,
                "tier": tier,
                "days": days,
                "is_lifetime": (days <= 0),
                "expiry_date": expiry_val,
                "client_name": client,
                "issued_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
                "is_sent": False,
            }

            records = []
            if ISSUED_LICENSES_FILE.exists():
                try:
                    with open(ISSUED_LICENSES_FILE, "r", encoding="utf-8") as f:
                        records = json.load(f)
                except Exception:
                    records = []

            records.append(new_record)
            try:
                with open(ISSUED_LICENSES_FILE, "w", encoding="utf-8") as f:
                    json.dump(records, f, indent=2, ensure_ascii=False)
            except Exception as e:
                print(f"[!] Không thể ghi file issued_licenses.json: {e}")

            # Đưa lên ô hiển thị
            self.key_box.delete("1.0", tk.END)
            self.key_box.insert(tk.END, license_key)

            # Tự động Copy vào Clipboard
            self.clipboard_clear()
            self.clipboard_append(license_key)
            self.copy_status_lbl.config(text="✅ Đã tự động sao chép vào Clipboard!")

            # Soạn tin nhắn mẫu gửi khách
            msg = (
                f"Xin chào {client},\n\n"
                f"Cảm ơn bạn đã đăng ký sử dụng phần mềm VideoTranslate AI!\n"
                f"Dưới đây là thông tin kích hoạt bản quyền của bạn:\n\n"
                f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                f"📌 Gói bản quyền : {plan_name}\n"
                f"📅 Hạn sử dụng   : {expiry_str}\n"
                f"💻 Ràng buộc HWID: {hwid}\n"
                f"🔑 MÃ BẢN QUYỀN :\n{license_key}\n"
                f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
                f"👉 Hướng dẫn kích hoạt:\n"
                f"1. Mở ứng dụng VideoTranslate AI.\n"
                f"2. Bấm vào nút 'Nâng Cấp PRO' hoặc Badge bản quyền ở góc trên màn hình.\n"
                f"3. Dán mã key ở trên vào ô 'Nhập License Key' và bấm 'Kích hoạt ngay'.\n\n"
                f"Chúc bạn có trải nghiệm tuyệt vời cùng VideoTranslate AI!"
            )
            self.msg_box.delete("1.0", tk.END)
            self.msg_box.insert(tk.END, msg)

            # Cập nhật lại dữ liệu lịch sử ở Tab 2
            self._load_licenses_data()

        except Exception as e:
            messagebox.showerror("Lỗi Cấp Key", f"Không thể tạo mã bản quyền:\n{e}")

    def _copy_key(self):
        key = self.key_box.get("1.0", tk.END).strip()
        if key:
            self.clipboard_clear()
            self.clipboard_append(key)
            self.copy_status_lbl.config(text="✅ Đã sao chép Key!")
            self.after(3000, lambda: self.copy_status_lbl.config(text=""))

    def _copy_message(self):
        msg = self.msg_box.get("1.0", tk.END).strip()
        if msg:
            self.clipboard_clear()
            self.clipboard_append(msg)
            messagebox.showinfo("Thành Công", "Đã sao chép toàn bộ tin nhắn gửi khách vào Clipboard!")

    # ──────────────────────────────────────────────────────────────────────────
    # TAB 2: LỊCH SỬ & QUẢN LÝ (SẮP XẾP, ĐÁNH DẤU GỬI, TỰ XÓA HẾT HẠN)
    # ──────────────────────────────────────────────────────────────────────────
    def _build_history_tab(self):
        container = tk.Frame(self.tab_history, bg=THEME["bg"])
        container.pack(fill="both", expand=True, padx=16, pady=12)

        # Thanh công cụ trên
        toolbar = tk.Frame(container, bg=THEME["card_bg"], padx=12, pady=10)
        toolbar.pack(fill="x", pady=(0, 10))

        # 1. Tìm kiếm
        tk.Label(
            toolbar,
            text="🔍 Tìm kiếm:",
            font=("Segoe UI", 9, "bold"),
            bg=THEME["card_bg"],
            fg=THEME["text_main"],
        ).pack(side="left")

        self.search_entry = tk.Entry(
            toolbar,
            font=("Segoe UI", 9),
            bg=THEME["input_bg"],
            fg=THEME["input_fg"],
            insertbackground="white",
            relief="flat",
            bd=4,
            width=24,
        )
        self.search_entry.pack(side="left", padx=8)
        self.search_entry.bind("<KeyRelease>", lambda e: self._apply_filter_and_search())

        # 2. Bộ lọc trạng thái
        tk.Label(
            toolbar,
            text="Bộ lọc:",
            font=("Segoe UI", 9, "bold"),
            bg=THEME["card_bg"],
            fg=THEME["text_muted"],
        ).pack(side="left", padx=(10, 4))

        self.filter_combobox = ttk.Combobox(
            toolbar,
            values=["Tất Cả", "Chưa Gửi Khách", "Đã Gửi Khách", "Còn Hạn", "Đã Hết Hạn"],
            state="readonly",
            width=15,
            font=("Segoe UI", 9),
        )
        self.filter_combobox.set("Tất Cả")
        self.filter_combobox.pack(side="left", padx=4)
        self.filter_combobox.bind("<<ComboboxSelected>>", lambda e: self._apply_filter_and_search())

        # 3. Nút Dọn Dẹp Key Hết Hạn
        clean_exp_btn = tk.Button(
            toolbar,
            text="🧹 Tự Động Xóa Key Hết Hạn",
            font=("Segoe UI", 9, "bold"),
            bg="#7f1d1d",
            fg="#fecaca",
            activebackground=THEME["accent_red"],
            activeforeground="#fff",
            relief="flat",
            padx=10,
            cursor="hand2",
            command=self._clean_expired_licenses,
        )
        clean_exp_btn.pack(side="left", padx=10)

        # 4. Nút Làm Mới
        refresh_btn = tk.Button(
            toolbar,
            text="🔄 Làm Mới",
            font=("Segoe UI", 9),
            bg=THEME["card_border"],
            fg=THEME["text_main"],
            relief="flat",
            padx=10,
            cursor="hand2",
            command=self._load_licenses_data,
        )
        refresh_btn.pack(side="left", padx=4)

        # Thống kê bên phải
        self.summary_lbl = tk.Label(
            toolbar,
            text="",
            font=("Segoe UI", 9),
            bg=THEME["card_bg"],
            fg=THEME["accent_green"],
        )
        self.summary_lbl.pack(side="right")

        # Bảng dữ liệu Treeview (Có sắp xếp cột bằng cách click Header)
        tree_frame = tk.Frame(container, bg=THEME["card_bg"])
        tree_frame.pack(fill="both", expand=True)

        columns = ("sent_status", "client", "hwid", "plan", "expiry", "time_status", "issued_at")
        self.tree = ttk.Treeview(
            tree_frame,
            columns=columns,
            show="headings",
            selectmode="browse",
        )

        # Cấu hình Header và Gán sự kiện Sort kèm Icon ↕
        self.column_headers = {
            "sent_status": ("Gửi Khách", 110, "center"),
            "client": ("Khách Hàng", 170, "w"),
            "hwid": ("Mã Máy (HWID)", 210, "w"),
            "plan": ("Gói Bản Quyền", 120, "center"),
            "expiry": ("Ngày Hết Hạn", 125, "center"),
            "time_status": ("Hiệu Lực", 110, "center"),
            "issued_at": ("Thời Gian Cấp", 160, "center"),
        }

        for col_id, (base_title, col_w, col_anchor) in self.column_headers.items():
            self.tree.heading(
                col_id,
                text=f"{base_title} ↕",
                command=lambda c=col_id: self._sort_by_column(c),
            )
            self.tree.column(col_id, width=col_w, anchor=col_anchor)

        scrollbar = ttk.Scrollbar(tree_frame, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)

        self.tree.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        # Sự kiện click đúp để Toggle Đã gửi / Chưa gửi
        self.tree.bind("<Double-1>", lambda e: self._toggle_sent_status())

        # Gợi ý thao tác & Thanh nút bấm dưới bảng
        hint_bar = tk.Frame(container, bg=THEME["bg"], pady=4)
        hint_bar.pack(fill="x")

        tk.Label(
            hint_bar,
            text="💡 Mẹo: Nhấp vào TIÊU ĐỀ CỘT (icon ↕) để sắp xếp | NHẤP ĐÚP vào dòng để đổi trạng thái 'Đã gửi' ↔ 'Chưa gửi'",
            font=("Segoe UI", 8, "italic"),
            bg=THEME["bg"],
            fg=THEME["text_muted"],
        ).pack(side="left")

        action_bar = tk.Frame(container, bg=THEME["bg"], pady=6)
        action_bar.pack(fill="x")

        toggle_sent_btn = tk.Button(
            action_bar,
            text="✅/⏳ Đổi Trạng Thái 'Đã Gửi'",
            font=("Segoe UI", 9, "bold"),
            bg=THEME["card_border"],
            fg=THEME["accent_amber"],
            activebackground=THEME["accent_amber"],
            activeforeground="#000",
            relief="flat",
            padx=12,
            pady=6,
            cursor="hand2",
            command=self._toggle_sent_status,
        )
        toggle_sent_btn.pack(side="left", padx=(0, 8))

        copy_selected_btn = tk.Button(
            action_bar,
            text="📋 Sao Chép Key Của Dòng Đang Chọn",
            font=("Segoe UI", 9, "bold"),
            bg=THEME["accent_blue"],
            fg="#fff",
            activebackground="#2563eb",
            activeforeground="#fff",
            relief="flat",
            padx=14,
            pady=6,
            cursor="hand2",
            command=self._copy_selected_license,
        )
        copy_selected_btn.pack(side="left", padx=(0, 8))

        delete_btn = tk.Button(
            action_bar,
            text="🗑️ Xóa Bản Ghi Này",
            font=("Segoe UI", 9),
            bg=THEME["card_border"],
            fg=THEME["accent_red"],
            activebackground=THEME["accent_red"],
            activeforeground="#fff",
            relief="flat",
            padx=12,
            pady=6,
            cursor="hand2",
            command=self._delete_selected_license,
        )
        delete_btn.pack(side="left")

        # Nhóm nút Đồng bộ / Xuất / Nhập dữ liệu cho 2 dev
        import_btn = tk.Button(
            action_bar,
            text="📥 Nhập & Hợp Nhất (Sync)",
            font=("Segoe UI", 9, "bold"),
            bg="#065f46",
            fg="#a7f3d0",
            activebackground=THEME["accent_green"],
            activeforeground="#000",
            relief="flat",
            padx=12,
            pady=6,
            cursor="hand2",
            command=self._import_and_merge_licenses,
        )
        import_btn.pack(side="right", padx=(6, 0))

        export_btn = tk.Button(
            action_bar,
            text="📤 Xuất Dữ Liệu (Backup/Chia Sẻ)",
            font=("Segoe UI", 9, "bold"),
            bg="#1e3a8a",
            fg="#bfdbfe",
            activebackground=THEME["accent_blue"],
            activeforeground="#fff",
            relief="flat",
            padx=12,
            pady=6,
            cursor="hand2",
            command=self._export_licenses,
        )
        export_btn.pack(side="right", padx=(6, 0))

    def _is_expired(self, lic: dict) -> bool:
        """Kiểm tra xem key đã hết hạn chưa."""
        if lic.get("is_lifetime"):
            return False
        exp_str = lic.get("expiry_date", "")
        if not exp_str:
            return False
        try:
            today_str = datetime.now().strftime("%Y-%m-%d")
            return exp_str < today_str
        except Exception:
            return False

    def _load_licenses_data(self):
        self.all_licenses = []
        if ISSUED_LICENSES_FILE.exists():
            try:
                with open(ISSUED_LICENSES_FILE, "r", encoding="utf-8") as f:
                    self.all_licenses = json.load(f)
            except Exception as e:
                print(f"[!] Lỗi đọc {ISSUED_LICENSES_FILE}: {e}")

        # Thống kê
        total = len(self.all_licenses)
        sent_count = sum(1 for lic in self.all_licenses if lic.get("is_sent"))
        expired_count = sum(1 for lic in self.all_licenses if self._is_expired(lic))

        self.summary_lbl.config(
            text=f"Tổng: {total} key  |  Đã gửi: {sent_count}  |  Chưa gửi: {total - sent_count}  |  Hết hạn: {expired_count}"
        )

        self._apply_filter_and_search()

    def _render_tree(self, data_list):
        for item in self.tree.get_children():
            self.tree.delete(item)

        for lic in data_list:
            is_sent = lic.get("is_sent", False)
            sent_str = "✅ Đã gửi" if is_sent else "⏳ Chưa gửi"
            client = lic.get("client_name") or "Quý Khách"
            hwid = lic.get("hwid") or ""
            is_life = lic.get("is_lifetime")
            days = lic.get("days", 0)
            plan = "⭐ Vĩnh Viễn" if is_life else f"{days} Ngày ({lic.get('tier', 'PRO')})"
            expiry = lic.get("expiry_date") or ""
            issued_at = lic.get("issued_at") or ""

            # Trạng thái hiệu lực
            if is_life:
                time_status = "⭐ Vĩnh Viễn"
            elif self._is_expired(lic):
                time_status = "⛔ Hết Hạn"
            else:
                time_status = "🟢 Còn Hạn"

            item_id = self.tree.insert(
                "",
                "end",
                values=(sent_str, client, hwid, plan, expiry, time_status, issued_at),
            )
            # Gắn id bản ghi để tiện tra cứu
            self.tree.set(item_id, column="hwid", value=hwid)

    def _apply_filter_and_search(self):
        query = self.search_entry.get().strip().lower()
        filter_mode = self.filter_combobox.get()

        data = list(self.all_licenses)

        # 1. Lọc theo trạng thái
        if filter_mode == "Chưa Gửi Khách":
            data = [lic for lic in data if not lic.get("is_sent")]
        elif filter_mode == "Đã Gửi Khách":
            data = [lic for lic in data if lic.get("is_sent")]
        elif filter_mode == "Còn Hạn":
            data = [lic for lic in data if not self._is_expired(lic)]
        elif filter_mode == "Đã Hết Hạn":
            data = [lic for lic in data if self._is_expired(lic)]

        # 2. Tìm kiếm theo từ khóa
        if query:
            data = [
                lic for lic in data
                if query in (lic.get("client_name") or "").lower()
                or query in (lic.get("hwid") or "").lower()
                or query in (lic.get("expiry_date") or "").lower()
            ]

        self._render_tree(data)

    def _sort_by_column(self, col):
        """Sắp xếp dữ liệu theo cột được bấm trên Header (Lần đầu: A-Z, Lần hai: Z-A) kèm icon."""
        current_direction = self.sort_directions.get(col, True)
        reverse = not current_direction
        self.sort_directions[col] = reverse

        # Cập nhật icon động trên các Header (▲ tăng dần, ▼ giảm dần, ↕ chưa xếp)
        indicator = " ▼" if reverse else " ▲"
        for c_id, (base_title, _, _) in self.column_headers.items():
            if c_id == col:
                self.tree.heading(c_id, text=f"{base_title}{indicator}")
            else:
                self.tree.heading(c_id, text=f"{base_title} ↕")

        # Key map giữa column name và dict key
        col_map = {
            "sent_status": lambda lic: 1 if lic.get("is_sent") else 0,
            "client": lambda lic: (lic.get("client_name") or "").lower(),
            "hwid": lambda lic: (lic.get("hwid") or "").lower(),
            "plan": lambda lic: 999999 if lic.get("is_lifetime") else lic.get("days", 0),
            "expiry": lambda lic: lic.get("expiry_date") or "",
            "time_status": lambda lic: 0 if self._is_expired(lic) else 1,
            "issued_at": lambda lic: lic.get("issued_at") or "",
        }

        sort_func = col_map.get(col, lambda lic: "")
        self.all_licenses.sort(key=sort_func, reverse=reverse)
        self._apply_filter_and_search()

    def _toggle_sent_status(self):
        """Đổi trạng thái Đã gửi <-> Chưa gửi cho dòng đang chọn."""
        selected_item = self.tree.selection()
        if not selected_item:
            messagebox.showinfo("Chưa Chọn", "Vui lòng chọn một dòng khách hàng trong bảng!")
            return

        item_vals = self.tree.item(selected_item[0], "values")
        client_name = item_vals[1]
        hwid = item_vals[2]

        found = False
        for lic in self.all_licenses:
            if lic.get("hwid") == hwid and (lic.get("client_name") or "Quý Khách") == client_name:
                curr_status = lic.get("is_sent", False)
                lic["is_sent"] = not curr_status
                found = True
                break

        if found:
            try:
                with open(ISSUED_LICENSES_FILE, "w", encoding="utf-8") as f:
                    json.dump(self.all_licenses, f, indent=2, ensure_ascii=False)
                self._load_licenses_data()
            except Exception as e:
                messagebox.showerror("Lỗi Lưu", f"Không thể lưu trạng thái: {e}")

    def _clean_expired_licenses(self):
        """Tự động tìm và xóa tất cả các key đã hết hạn."""
        expired_list = [lic for lic in self.all_licenses if self._is_expired(lic)]
        count = len(expired_list)

        if count == 0:
            messagebox.showinfo("Thông Báo", "Tuyệt vời! Hiện tại không có key nào bị hết hạn trong danh sách.")
            return

        confirm = messagebox.askyesno(
            "Xác Nhận Dọn Dẹp",
            f"Phát hiện {count} mã key đã HẾT HẠN sử dụng.\n\n"
            f"Bạn có muốn tự động XÓA TOÀN BỘ {count} key hết hạn này để làm sạch danh sách không?",
        )
        if not confirm:
            return

        # Giữ lại các key chưa hết hạn
        self.all_licenses = [lic for lic in self.all_licenses if not self._is_expired(lic)]

        try:
            with open(ISSUED_LICENSES_FILE, "w", encoding="utf-8") as f:
                json.dump(self.all_licenses, f, indent=2, ensure_ascii=False)
            self._load_licenses_data()
            messagebox.showinfo("Hoàn Tất", f"Đã xóa thành công {count} key hết hạn khỏi hệ thống!")
        except Exception as e:
            messagebox.showerror("Lỗi Lưu File", f"Không thể cập nhật danh sách: {e}")

    def _copy_selected_license(self):
        selected_item = self.tree.selection()
        if not selected_item:
            messagebox.showinfo("Chưa Chọn", "Vui lòng chọn một dòng khách hàng trong bảng!")
            return

        item_vals = self.tree.item(selected_item[0], "values")
        client_name = item_vals[1]
        hwid = item_vals[2]

        for lic in self.all_licenses:
            if lic.get("hwid") == hwid and (lic.get("client_name") or "Quý Khách") == client_name:
                key = lic.get("license_key")
                if key:
                    self.clipboard_clear()
                    self.clipboard_append(key)
                    messagebox.showinfo("Đã Sao Chép", f"Đã copy mã kích hoạt của khách '{client_name}' vào Clipboard!")
                    return
        messagebox.showwarning("Không Tìm Thấy", "Không tìm thấy chuỗi key tương ứng.")

    def _delete_selected_license(self):
        selected_item = self.tree.selection()
        if not selected_item:
            messagebox.showinfo("Chưa Chọn", "Vui lòng chọn một dòng khách hàng cần xóa!")
            return

        item_vals = self.tree.item(selected_item[0], "values")
        client_name = item_vals[1]
        hwid = item_vals[2]

        if not messagebox.askyesno("Xác Nhận Xóa", f"Bạn có chắc muốn xóa bản ghi của '{client_name}' ({hwid})?"):
            return

        self.all_licenses = [
            lic for lic in self.all_licenses
            if not (lic.get("hwid") == hwid and (lic.get("client_name") or "Quý Khách") == client_name)
        ]

        try:
            with open(ISSUED_LICENSES_FILE, "w", encoding="utf-8") as f:
                json.dump(self.all_licenses, f, indent=2, ensure_ascii=False)
            self._load_licenses_data()
            messagebox.showinfo("Thành Công", "Đã xóa bản ghi thành công.")
        except Exception as e:
            messagebox.showerror("Lỗi Lưu File", f"Không thể cập nhật danh sách: {e}")

    def _export_licenses(self):
        """Xuất danh sách license ra file JSON để sao lưu hoặc chia sẻ cho cộng sự."""
        if not self.all_licenses:
            messagebox.showwarning("Dữ Liệu Trống", "Hiện chưa có mã bản quyền nào trong danh sách để xuất!")
            return

        now_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        default_filename = f"licenses_export_{now_str}.json"

        file_path = filedialog.asksaveasfilename(
            title="Chọn nơi lưu file bản quyền xuất ra",
            initialfile=default_filename,
            defaultextension=".json",
            filetypes=[("JSON Files", "*.json"), ("All Files", "*.*")],
        )
        if not file_path:
            return

        try:
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(self.all_licenses, f, indent=2, ensure_ascii=False)
            messagebox.showinfo(
                "Xuất Dữ Liệu Thành Công",
                f"Đã xuất thành công {len(self.all_licenses)} mã bản quyền ra file:\n\n{file_path}\n\n"
                f"💡 Bạn có thể gửi file này cho bạn của bạn để họ bấm 'Nhập & Hợp Nhất' vào ứng dụng của họ!"
            )
        except Exception as e:
            messagebox.showerror("Lỗi Xuất File", f"Không thể lưu file: {e}")

    def _import_and_merge_licenses(self):
        """Nhập file JSON từ máy khác và hợp nhất thông minh vào cơ sở dữ liệu hiện tại."""
        file_path = filedialog.askopenfilename(
            title="Chọn file JSON bản quyền để Nhập & Hợp nhất",
            filetypes=[("JSON Files", "*.json"), ("All Files", "*.*")],
        )
        if not file_path:
            return

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                incoming_data = json.load(f)
        except Exception as e:
            messagebox.showerror("Lỗi Đọc File", f"Không thể đọc hoặc phân tích file JSON:\n{e}")
            return

        if not isinstance(incoming_data, list):
            messagebox.showerror("Lỗi Định Dạng", "Nội dung file không đúng cấu trúc danh sách bản quyền!")
            return

        if not incoming_data:
            messagebox.showinfo("Thông Báo", "File được chọn không chứa mã bản quyền nào.")
            return

        # Chỉ mục các bản ghi hiện tại theo license_key
        existing_by_key = {}
        for lic in self.all_licenses:
            key = lic.get("license_key")
            if key:
                existing_by_key[key] = lic

        new_count = 0
        updated_count = 0
        unchanged_count = 0

        for item in incoming_data:
            if not isinstance(item, dict):
                continue
            key = item.get("license_key")
            if not key:
                continue

            if key in existing_by_key:
                # Đã có trong danh sách -> kiểm tra cập nhật trạng thái
                existing_item = existing_by_key[key]
                has_change = False

                # Cập nhật trạng thái đã gửi khách nếu bên file mới đã đánh dấu gửi
                if item.get("is_sent") and not existing_item.get("is_sent"):
                    existing_item["is_sent"] = True
                    has_change = True

                # Cập nhật tên khách hàng nếu bên kia có ghi chú chi tiết hơn
                incoming_client = (item.get("client_name") or "").strip()
                existing_client = (existing_item.get("client_name") or "").strip()
                if incoming_client and incoming_client != "Quý Khách" and existing_client in ("", "Quý Khách"):
                    existing_item["client_name"] = incoming_client
                    has_change = True

                if has_change:
                    updated_count += 1
                else:
                    unchanged_count += 1
            else:
                # Chưa có -> Thêm mới vào danh sách
                if not item.get("id"):
                    item["id"] = f"lic_{uuid.uuid4().hex[:8]}"
                self.all_licenses.append(item)
                existing_by_key[key] = item
                new_count += 1

        if new_count > 0 or updated_count > 0:
            try:
                with open(ISSUED_LICENSES_FILE, "w", encoding="utf-8") as f:
                    json.dump(self.all_licenses, f, indent=2, ensure_ascii=False)
                self._load_licenses_data()
                messagebox.showinfo(
                    "Hợp Nhất Thành Công",
                    f"Đã hợp nhất dữ liệu từ:\n{Path(file_path).name}\n\n"
                    f"➕ Thêm mới : {new_count} key\n"
                    f"🔄 Cập nhật : {updated_count} key\n"
                    f"⏸️ Giữ nguyên : {unchanged_count} key\n\n"
                    f"📊 Tổng số key trong hệ thống: {len(self.all_licenses)} key"
                )
            except Exception as e:
                messagebox.showerror("Lỗi Lưu Dữ Liệu", f"Không thể lưu sau khi hợp nhất: {e}")
        else:
            messagebox.showinfo(
                "Đồng Bộ Hoàn Tất",
                f"Toàn bộ {len(incoming_data)} key trong file đã có sẵn trong ứng dụng.\n"
                f"Không có dữ liệu mới nào cần bổ sung."
            )


if __name__ == "__main__":
    app = KeygenAdminApp()
    app.mainloop()
