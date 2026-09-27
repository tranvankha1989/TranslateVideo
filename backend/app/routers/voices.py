from fastapi import APIRouter, File, UploadFile, Form, BackgroundTasks

from app.services.voice_service import (
    fetch_all_voices,
    clone_custom_voice,
    remove_custom_voice,
    generate_random_preview,
    discard_preview_voice,
    save_preview_as_custom_voice,
)

router = APIRouter(prefix="/api/voices", tags=["Voices"])


@router.get("", summary="Lấy danh sách tất cả giọng đọc mẫu và giọng tự tạo")
async def get_voices():
    """Trả về danh sách giọng đọc mặc định và giọng tùy chỉnh do người dùng tạo."""
    return await fetch_all_voices()


@router.post("/clone", summary="Clone giọng đọc từ 1 hoặc nhiều file mẫu âm thanh và tạo cache .pt")
async def clone_voice(
    name: str = Form(...),
    files: list[UploadFile] | None = File(None),
    file: UploadFile | None = File(None),
    transcripts: str | None = Form(None),
    transcript: str | None = Form(None),
    description: str = Form("Giọng tự tạo"),
    gender: str = Form("all"),
    icon: str = Form("record_voice_over"),
    separate_vocals: bool = Form(False),
    remove_bgm: bool = Form(False),
):
    # Tập hợp các file tải lên
    uploaded_files: list[UploadFile] = []
    if files:
        uploaded_files.extend(files)
    if file and file not in uploaded_files:
        uploaded_files.append(file)

    if not uploaded_files:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp ít nhất 1 file âm thanh mẫu (.wav, .mp3, .m4a)")

    do_separate = bool(separate_vocals or remove_bgm)

    return await clone_custom_voice(
        files=uploaded_files,
        name=name,
        transcript=transcript,
        transcripts=transcripts,
        description=description,
        gender=gender,
        icon=icon,
        separate_vocals=do_separate,
    )


@router.delete("/custom/{voice_id}", summary="Xoá giọng đọc tự tạo")
async def delete_custom_voice(voice_id: str):
    return await remove_custom_voice(voice_id)


from app.schemas.voice import RandomVoiceRequest, RandomVoiceResponse

@router.post("/random", response_model=RandomVoiceResponse, summary="Tạo giọng ngẫu nhiên hoặc thiết kế giọng tùy chỉnh để xem trước")
async def generate_random_voice(
    background_tasks: BackgroundTasks,
    request: RandomVoiceRequest | None = None,
):
    return await generate_random_preview(background_tasks, req=request)


@router.delete("/discard-random/{filename}", summary="Huỷ bỏ file preview ngẫu nhiên không sử dụng")
@router.delete("/random/{filename}", summary="Huỷ bỏ file preview ngẫu nhiên (alias)")
async def discard_random_voice(filename: str):
    return await discard_preview_voice(filename)


@router.post("/save-random", summary="Lưu giọng ngẫu nhiên vừa preview thành custom voice")
async def save_random_voice(
    name: str = Form(...),
    description: str = Form("Giọng ngẫu nhiên"),
    gender: str = Form("all"),
    icon: str = Form("casino"),
    filename: str = Form(...),
    instruct: str = Form(""),
):
    return await save_preview_as_custom_voice(
        name=name,
        description=description,
        gender=gender,
        icon=icon,
        filename=filename,
        instruct=instruct,
    )
