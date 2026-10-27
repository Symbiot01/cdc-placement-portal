#!/usr/bin/env python3
"""Export Chrome Web Store graphics at exact required sizes."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "assets"
OUT.mkdir(parents=True, exist_ok=True)
EXT = ROOT.parent / "extension"
SRC_ASSETS = Path(
    "/home/dev/.cursor/projects/home-dev-Projects-cdc-placement-portal/assets"
)
SHOTS = Path("/tmp/cursor/screenshots")

NAVY = (11, 31, 58)
AMBER = (245, 158, 11)
WHITE = (255, 255, 255)
SLATE = (203, 213, 225)


def to_rgb(img: Image.Image) -> Image.Image:
    if img.mode == "RGB":
        return img
    if img.mode in ("RGBA", "LA"):
        bg = Image.new("RGB", img.size, NAVY)
        bg.paste(img, mask=img.split()[-1])
        return bg
    return img.convert("RGB")


def fit_exact(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    img = to_rgb(img)
    tw, th = size
    src_ratio = img.width / img.height
    dst_ratio = tw / th
    if src_ratio > dst_ratio:
        new_h = img.height
        new_w = int(new_h * dst_ratio)
        left = (img.width - new_w) // 2
        img = img.crop((left, 0, left + new_w, new_h))
    else:
        new_w = img.width
        new_h = int(new_w / dst_ratio)
        top = (img.height - new_h) // 2
        img = img.crop((0, top, new_w, top + new_h))
    return img.resize(size, Image.Resampling.LANCZOS)


def save_png(img: Image.Image, path: Path) -> None:
    to_rgb(img).save(path, "PNG", optimize=True)


def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def make_icon(size: int, path: Path) -> None:
    src = SRC_ASSETS / "cdc-store-icon-source.jpg"
    if src.exists():
        img = fit_exact(Image.open(src), (size, size))
        save_png(img, path)
        return
    img = Image.new("RGB", (size, size), NAVY)
    draw = ImageDraw.Draw(img)
    pad = max(8, size // 10)
    draw.rounded_rectangle(
        (pad, pad, size - pad, size - pad),
        radius=size // 6,
        fill=AMBER,
    )
    f = font(max(14, int(size * 0.28)))
    text = "CDC"
    bbox = draw.textbbox((0, 0), text, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - tw) / 2, (size - th) / 2 - th * 0.08), text, font=f, fill=NAVY)
    save_png(img, path)


def make_how_it_works() -> None:
    img = Image.new("RGB", (1280, 800), NAVY)
    draw = ImageDraw.Draw(img)
    title_f = font(42)
    body_f = font(22, bold=False)
    card_f = font(22)
    small_f = font(16, bold=False)
    draw.rounded_rectangle((48, 40, 220, 78), radius=6, fill=AMBER)
    draw.text((64, 48), "CDC BRIDGE", font=font(18), fill=NAVY)
    draw.text((48, 100), "Your browser talks to ERP.", font=title_f, fill=WHITE)
    draw.text((48, 156), "Nothing else does.", font=title_f, fill=AMBER)
    draw.text(
        (48, 230),
        "Local Chrome bridge for the IIT Kharagpur CDC Placement Portal.",
        font=body_f,
        fill=SLATE,
    )
    draw.text(
        (48, 264),
        "Uses your ERP cookies in this browser. Requests go only to erp.iitkgp.ac.in.",
        font=body_f,
        fill=SLATE,
    )
    cards = [
        ("1", "Install the bridge", "Activates only on the\nCDC Placement Portal."),
        ("2", "Sign in locally", "Roll, password, and answers\nstay in this browser."),
        ("3", "Apply from the portal", "Roles, notices, JDs, and CV\napply/cancel stay on ERP."),
    ]
    for i, (n, title, body) in enumerate(cards):
        x = 48 + i * 400
        draw.rounded_rectangle((x, 360, x + 372, 640), radius=16, fill=(18, 48, 90))
        draw.ellipse((x + 24, 384, x + 64, 424), fill=AMBER)
        draw.text((x + 36, 390), n, font=font(20), fill=NAVY)
        draw.text((x + 24, 448), title, font=card_f, fill=WHITE)
        draw.multiline_text((x + 24, 500), body, font=body_f, fill=SLATE, spacing=8)
    draw.text(
        (48, 720),
        "Unofficial student tool. Not affiliated with CDC, ERP, or IIT Kharagpur administration.",
        font=small_f,
        fill=(147, 197, 253),
    )
    save_png(img, OUT / "screenshot-04-how-it-works-1280x800.png")


def main() -> None:
    shots = [
        (SHOTS / "cws-workspace-final.png", OUT / "screenshot-01-workspace-1280x800.png"),
        (SHOTS / "cws-login-final.png", OUT / "screenshot-02-login-1280x800.png"),
        (SHOTS / "cws-03-privacy-1280x800.png", OUT / "screenshot-03-privacy-1280x800.png"),
    ]
    for src, dest in shots:
        if not src.exists():
            raise SystemExit(f"Missing screenshot: {src}")
        save_png(fit_exact(Image.open(src), (1280, 800)), dest)

    make_how_it_works()

    small_src = SRC_ASSETS / "cdc-small-promo-source.jpg"
    marquee_src = SRC_ASSETS / "cdc-marquee-source.jpg"
    save_png(fit_exact(Image.open(small_src), (440, 280)), OUT / "small-promo-440x280.png")
    save_png(fit_exact(Image.open(marquee_src), (1400, 560)), OUT / "marquee-1400x560.png")

    make_icon(128, OUT / "icon-128.png")
    make_icon(48, OUT / "icon-48.png")
    make_icon(16, OUT / "icon-16.png")
    for name in ("icon-128.png", "icon-48.png", "icon-16.png"):
        (EXT / name).write_bytes((OUT / name).read_bytes())

    print("Wrote store assets:")
    for path in sorted(OUT.iterdir()):
        if path.suffix.lower() in {".png", ".jpg"}:
            im = Image.open(path)
            print(f"  {path.name:44} {im.size} {im.mode}")


if __name__ == "__main__":
    main()
