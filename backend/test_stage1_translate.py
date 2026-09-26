import asyncio
import sys
from app.services.translator_service import TranslationService, get_supported_languages

sys.stdout.reconfigure(encoding='utf-8')

async def main():
    print("=" * 60)
    print("🚀 KIỂM THỬ GIAI ĐOẠN 1: DỊCH THUẬT PHỤ ĐỀ (TRANSLATION SERVICE)")
    print("=" * 60)

    # 1. Kiểm tra danh mục ngôn ngữ
    langs = get_supported_languages()
    print(f"✅ Đã nạp {len(langs)} ngôn ngữ hỗ trợ: {[l['code'] for l in langs[:6]]}...")

    # 2. Test dịch văn bản đơn lẻ (English -> Tiếng Việt)
    en_text = "Welcome everyone to our AI video translation tutorial!"
    print(f"\n[Test 1] Dịch câu đơn lẻ:")
    print(f"  - Gốc (EN): {en_text}")
    vi_res = await TranslationService.translate_text(en_text, source_lang="en", target_lang="vi")
    print(f"  - Dịch (VI): {vi_res}")
    assert len(vi_res) > 0, "Dịch câu đơn thất bại!"

    # 3. Test dịch văn bản đơn lẻ (Trung -> Tiếng Việt)
    zh_text = "人工智能正在彻底改变视频创作的未来。"
    print(f"\n[Test 2] Dịch tiếng Trung sang tiếng Việt:")
    print(f"  - Gốc (ZH): {zh_text}")
    vi_zh_res = await TranslationService.translate_text(zh_text, source_lang="zh-cn", target_lang="vi")
    print(f"  - Dịch (VI): {vi_zh_res}")

    # 4. Test dịch danh sách Subtitle Segments (giữ nguyên timestamp)
    sample_segments = [
        {"id": 1, "start": 0.0, "end": 2.5, "text": "Hello, how are you today?"},
        {"id": 2, "start": 2.6, "end": 5.2, "text": "In this video, I will show you how to translate videos automatically."},
        {"id": 3, "start": 5.5, "end": 8.0, "text": "It preserves the background music and syncs the voice perfectly."},
    ]
    print(f"\n[Test 3] Dịch danh sách Subtitle Segments (3 câu) giữ nguyên mốc thời gian:")
    translated_segments = await TranslationService.translate_segments(
        segments=sample_segments,
        source_lang="en",
        target_lang="vi",
        provider="google"
    )

    for seg in translated_segments:
        print(f"  [{seg['start']:.1f}s -> {seg['end']:.1f}s] ID {seg['id']}:")
        print(f"     Gốc: {seg['original_text']}")
        print(f"     Dịch: {seg['text']}")
        assert seg["start"] == sample_segments[seg["id"]-1]["start"], "Lệch start timestamp!"
        assert seg["end"] == sample_segments[seg["id"]-1]["end"], "Lệch end timestamp!"

    print("\n" + "=" * 60)
    print("🎉 TẤT CẢ CÁC BÀI TEST GIAI ĐOẠN 1 ĐÃ HOÀN THÀNH XUẤT SẮC 100%!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
