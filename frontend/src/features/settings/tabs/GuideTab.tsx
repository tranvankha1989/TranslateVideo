import React from "react";
import { Sparkles, ExternalLink, Cloud } from "lucide-react";

export const GuideTab: React.FC = () => {
  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Card 1: Hướng dẫn Google Colab + Ngrok Static Domain */}
      <div className="p-6 rounded-3xl bg-surface-variant/20 border border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Cách 1: Google Colab T4 GPU + Ngrok Static Domain (Khuyên Dùng)
          </h3>
          <span className="text-xs px-2.5 py-1 rounded-full bg-primary/15 text-primary border border-primary/30 font-medium">
            Cấu hình 1 lần - Dùng mãi mãi
          </span>
        </div>

        <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
          Giải pháp tối ưu nhất cho Google Colab: Đăng ký miễn phí 1 tên
          miền cố định từ Ngrok để không bao giờ phải sửa lại đường link
          nữa!
        </p>

        <div className="space-y-3 text-xs sm:text-sm">
          <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5 space-y-1">
            <span className="font-semibold text-primary block">
              Bước 1: Đăng ký tài khoản Ngrok miễn phí
            </span>
            <p className="text-on-surface-variant text-xs">
              Truy cập{" "}
              <a
                href="https://dashboard.ngrok.com"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline inline-flex items-center gap-1"
              >
                dashboard.ngrok.com <ExternalLink className="w-3 h-3" />
              </a>{" "}
              đăng nhập bằng Google trong 10 giây.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5 space-y-1">
            <span className="font-semibold text-primary block">
              Bước 2: Lấy Authtoken & Tên miền tĩnh
            </span>
            <p className="text-on-surface-variant text-xs">
              Vào mục <strong>Your Authtoken</strong> copy mã token. Sau đó
              vào mục <strong>Cloud Edge ➔ Domains</strong> bấm nhận 1
              domain tĩnh miễn phí (ví dụ:{" "}
              <code className="text-primary font-mono">
                tipper-semantic-dropper.ngrok-free.dev
              </code>
              ).
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5 space-y-1">
            <span className="font-semibold text-primary block">
              Bước 3: Chạy Notebook trên Google Colab
            </span>
            <p className="text-on-surface-variant text-xs">
              Mở file notebook{" "}
              <code className="text-primary font-mono">
                notebooks/OmniVoice_Colab_T4.ipynb
              </code>{" "}
              trên Google Colab. Nhập Authtoken và Static Domain rồi bấm{" "}
              <strong>Play (▶️)</strong>.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5 space-y-1">
            <span className="font-semibold text-primary block">
              Bước 4: Điền vào ô Cloud GPU URL ở Tab 1
            </span>
            <p className="text-on-surface-variant text-xs">
              Dán link domain Ngrok của bạn (ví dụ:{" "}
              <code className="text-primary font-mono">
                https://tipper-semantic-dropper.ngrok-free.dev
              </code>
              ) vào ô URL ở Tab 1 và bấm <strong>Lưu & Áp Dụng</strong>. Từ
              nay về sau mỗi lần dùng chỉ việc mở Colab bấm Play!
            </p>
          </div>
        </div>
      </div>

      {/* Card 2: Hugging Face ZeroGPU */}
      <div className="p-6 rounded-3xl bg-surface-variant/20 border border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
            <Cloud className="w-5 h-5 text-emerald-400" />
            Cách 2: Hugging Face Spaces (ZeroGPU A100) — Chạy 24/7 Không Cần
            Treo Tab
          </h3>
          <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
            Chạy 24/7
          </span>
        </div>

        <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
          Tạo một Space miễn phí trên Hugging Face bằng các file có sẵn
          trong thư mục{" "}
          <code className="text-primary font-mono">hf_space/</code> của dự
          án. Khi Space chạy, bạn copy đường link Space dán vào ô URL để
          dùng mọi lúc mọi nơi mà không cần treo máy.
        </p>
      </div>
    </div>
  );
};
