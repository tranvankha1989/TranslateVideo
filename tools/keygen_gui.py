"""
tools/keygen_gui.py
===================
Ứng dụng Desktop Độc Lập Quản Trị & Cấp Mã Bản Quyền (VideoTranslate AI).
- Giao diện trực quan (Tkinter Dark Mode hiện đại)
- Hoạt động 100% độc lập, không cần khởi động backend hay web app
- Ký số bảo mật Ed25519 với khóa bí mật nội bộ (tools/ed25519_private.pem)
- Tự động lưu trữ và quản lý danh sách key (tools/issued_licenses.json)
"""

import os
import sys
import json
import base64
import tkinter as tk
from tkinter import ttk, messagebox
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Đảm bảo import được module trong tools/
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
        PRIVATE_KEY_FILE,
        PUBLIC_KEY_FILE,
        DEFAULT_FEATURES,
    )
    from cryptography.hazmat.primitives.asymmetric import ed25519
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
        self.title("VideoTranslate AI - KeyGen Admin & License Manager")
        self.geometry("960 tender" if False else "980x720")
        self.minsize(860, 640)
        self.configure(bg=THEME["bg"])

        # Thiết lập Icon nếu có
        icon_path = PROJECT_DIR / "assets" / "app.ico"
        if icon_path.exists():
            try:
                self.iconbitmap(str(icon_path))
            except Exception:
                pass

        # Đảm bảo khóa Ed25519 đã sẵn sàng
        try:
            ensure_keypair()
        except Exception as e:
            messagebox.showerror("Lỗi Khóa Bảo Mật", f"Không thể tải hoặc tạo cặp khóa Ed25519: {e}")

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
            padding=[16, 8],
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
            rowheight=30,
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
        # Header Banner
        header = tk.Frame(self, bg=THEME["card_bg"], height=65)
        header.pack(fill="x", side="top")
        header.pack_propagate(False)

        title_lbl = tk.Label(
            header,
            text="⚡ VideoTranslate AI — Bộ Tạo & Quản Lý Bản Quyền Nội Bộ",
            font=("Segoe UI", 13, "bold"),
            bg=THEME["card_bg"],
            fg=THEME["text_main"],
        )
        title_lbl.pack(side="left", padx=20, pady=12)

        status_lbl = tk.Label(
            header,
            text="🔒 Thuật toán: Ed25519 Digital Signature (Offline)",
            font=("Segoe UI", 9),
            bg=THEME["card_bg"],
            fg=THEME["accent_green"],
        )
        status_lbl.pack(side="right", padx=20, pady=12)

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
            text="Chuỗi Mã Kích Hoạt (License Key):",
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
            pady=5,
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
        else:
            days = int(choice)
            tier = "TRIAL" if days == 7 else "PRO"
            plan_name = f"{days} Ngày"
            exp_date = datetime.now() + timedelta(days=days)
            expiry_str = exp_date.strftime("%d/%m/%Y")

        try:
            # Ký số Ed25519
            license_key = issue_license(
                hwid=hwid,
                days=days,
                tier=tier,
                features=DEFAULT_FEATURES,
                client_name=client,
            )

            # Lưu vào file issued_licenses.json
            import uuid
            new_record = {
                "id": f"lic_{uuid.uuid4().hex[:8]}",
                "license_key": license_key,
                "hwid": hwid,
                "tier": tier,
                "days": days,
                "is_lifetime": (days <= 0),
                "expiry_date": "2099-12-31" if days <= 0 else (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d"),
                "client_name": client,
                "issued_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
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
    # TAB 2: LỊCH SỬ & QUẢN LÝ
    # ──────────────────────────────────────────────────────────────────────────
    def _build_history_tab(self):
        container = tk.Frame(self.tab_history, bg=THEME["bg"])
        container.pack(fill="both", expand=True, padx=16, pady=12)

        # Thanh tìm kiếm & thống kê
        toolbar = tk.Frame(container, bg=THEME["card_bg"], padx=12, pady=10)
        toolbar.pack(fill="x", pady=(0, 10))

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
            width=30,
        )
        self.search_entry.pack(side="left", padx=8)
        self.search_entry.bind("<KeyRelease>", self._on_search)

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
        refresh_btn.pack(side="left", padx=5)

        self.summary_lbl = tk.Label(
            toolbar,
            text="",
            font=("Segoe UI", 9),
            bg=THEME["card_bg"],
            fg=THEME["accent_green"],
        )
        self.summary_lbl.pack(side="right")

        # Bảng dữ liệu Treeview
        tree_frame = tk.Frame(container, bg=THEME["card_bg"])
        tree_frame.pack(fill="both", expand=True)

        columns = ("client", "hwid", "plan", "expiry", "issued_at")
        self.tree = ttk.Treeview(
            tree_frame,
            columns=columns,
            show="headings",
            selectmode="browse",
        )

        self.tree.heading("client", text="Khách Hàng")
        self.tree.heading("hwid", text="Mã Máy (HWID)")
        self.tree.heading("plan", text="Gói Bản Quyền")
        self.tree.heading("expiry", text="Ngày Hết Hạn")
        self.tree.heading("issued_at", text="Thời Gian Cấp")

        self.tree.column("client", width=160, anchor="w")
        self.tree.column("hwid", width=220, anchor="w")
        self.tree.column("plan", width=120, anchor="center")
        self.tree.column("expiry", width=120, anchor="center")
        self.tree.column("issued_at", width=160, anchor="center")

        scrollbar = ttk.Scrollbar(tree_frame, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)

        self.tree.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        # Thanh thao tác dưới bảng
        action_bar = tk.Frame(container, bg=THEME["bg"], pady=8)
        action_bar.pack(fill="x")

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
        copy_selected_btn.pack(side="left", padx=(0, 10))

        delete_btn = tk.Button(
            action_bar,
            text="🗑️ Xóa Bản Ghi",
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

    def _load_licenses_data(self):
        for item in self.tree.get_children():
            self.tree.delete(item)

        self.all_licenses = []
        if ISSUED_LICENSES_FILE.exists():
            try:
                with open(ISSUED_LICENSES_FILE, "r", encoding="utf-8") as f:
                    self.all_licenses = json.load(f)
            except Exception as e:
                print(f"[!] Lỗi đọc {ISSUED_LICENSES_FILE}: {e}")

        # Thống kê
        total = len(self.all_licenses)
        lifetime_count = sum(1 for lic in self.all_licenses if lic.get("is_lifetime"))
        self.summary_lbl.config(
            text=f"Tổng cộng: {total} key  |  Vĩnh viễn: {lifetime_count}  |  Có thời hạn: {total - lifetime_count}"
        )

        self._render_tree(self.all_licenses)

    def _render_tree(self, data_list):
        for item in self.tree.get_children():
            self.tree.delete(item)

        for lic in reversed(data_list):
            client = lic.get("client_name") or "Quý Khách"
            hwid = lic.get("hwid") or ""
            is_life = lic.get("is_lifetime")
            days = lic.get("days", 0)
            plan = "⭐ Vĩnh Viễn" if is_life else f"{days} Ngày ({lic.get('tier', 'PRO')})"
            expiry = lic.get("expiry_date") or ""
            issued_at = lic.get("issued_at") or ""
            lic_key = lic.get("license_key") or ""

            item_id = self.tree.insert(
                "",
                "end",
                values=(client, hwid, plan, expiry, issued_at),
            )
            # Lưu trữ license_key và id vào dictionary để lấy lại
            self.tree.set(item_id, column="client", value=client)

    def _on_search(self, event=None):
        query = self.search_entry.get().strip().lower()
        if not query:
            self._render_tree(self.all_licenses)
            return

        filtered = [
            lic for lic in self.all_licenses
            if query in (lic.get("client_name") or "").lower()
            or query in (lic.get("hwid") or "").lower()
            or query in (lic.get("expiry_date") or "").lower()
        ]
        self._render_tree(filtered)

    def _copy_selected_license(self):
        selected_item = self.tree.selection()
        if not selected_item:
            messagebox.showinfo("Chưa Chọn", "Vui lòng chọn một dòng khách hàng trong bảng!")
            return

        item_vals = self.tree.item(selected_item[0], "values")
        client_name = item_vals[0]
        hwid = item_vals[1]

        # Tìm trong danh sách
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
        client_name = item_vals[0]
        hwid = item_vals[1]

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


if __name__ == "__main__":
    app = KeygenAdminApp()
    app.mainloop()
