import os
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def create_showcase():
    canvas_w, canvas_h = 1080, 2280
    output_dir = 'assets/phone-screenshots'
    web_output_dir = 'Website/assets/phone-screenshots'
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(web_output_dir, exist_ok=True)

    configs = [
        {
            "filename": "screenshot-1-voice-ai.png",
            "source": "assets/phone-screenshots/screenshot-1-voice-ai.png",
            "tag": "VOICE AI ENGINE",
            "title": "Speak Math Naturally",
            "subtitle": "AI filters conversational noise & solves instantly",
            "color": (245, 158, 11),  # Gold / Amber
            "badge1": ("100% Offline AI", "Zero latency & private", (245, 158, 11)),
            "badge2": ("Auto Noise Filter", "Strips filler words", (16, 185, 129)),
        },
        {
            "filename": "screenshot-2-floating-pip.png",
            "source": "assets/phone-screenshots/screenshot-2-floating-pip.png",
            "tag": "FLOATING PiP OVERLAY",
            "title": "Float Over Any App",
            "subtitle": "Multitask while chatting, shopping, or in sheets",
            "color": (6, 182, 212),  # Cyan
            "badge1": ("Always On Top", "Draggable mini calculator", (6, 182, 212)),
            "badge2": ("One-Tap Copy", "Paste results anywhere", (245, 158, 11)),
        },
        {
            "filename": "screenshot-3-scientific.png",
            "source": "assets/phone-screenshots/screenshot-3-scientific.png",
            "tag": "SCIENTIFIC POWER",
            "title": "Advanced Mathematics",
            "subtitle": "Trigonometry, logs, roots & universal constants",
            "color": (168, 85, 247),  # Purple
            "badge1": ("Full Trig & Logs", "sin, cos, ln, e^x, root", (168, 85, 247)),
            "badge2": ("DEG / RAD Modes", "High precision engine", (6, 182, 212)),
        },
        {
            "filename": "screenshot-4-history.png",
            "source": "assets/phone-screenshots/screenshot-4-history.png",
            "tag": "SMART MEMORY & HISTORY",
            "title": "Never Lose a Number",
            "subtitle": "Calculation log with voice tags & instant recall",
            "color": (16, 185, 129),  # Emerald
            "badge1": ("One-Tap Reuse", "Bring back past answers", (16, 185, 129)),
            "badge2": ("Voice & Keypad Logs", "Timestamps & expressions", (245, 158, 11)),
        },
        {
            "filename": "screenshot-5-settings-themes.png",
            "source": "assets/phone-screenshots/screenshot-5-settings-themes.png",
            "tag": "TACTILE HAPTIC FEEL",
            "title": "Mechanical Clicks & Themes",
            "subtitle": "Crisp tactile vibrations & luxury dark mode",
            "color": (244, 63, 94),  # Rose
            "badge1": ("Tactile Clicks", "Crisp mechanical feedback", (244, 63, 94)),
            "badge2": ("Multiple Accents", "Gold, Emerald, Cyan, Rose", (245, 158, 11)),
        },
        {
            "filename": "screenshot-6-main-keypad.png",
            "source": "assets/phone-screenshots/screenshot-6-main-keypad.png",
            "tag": "PRIVACY BY DESIGN",
            "title": "100% Offline · Zero Ads",
            "subtitle": "No sign-in, no tracking, pure clean speed",
            "color": (59, 130, 246),  # Blue
            "badge1": ("Zero Cloud Tracking", "On-device processing only", (59, 130, 246)),
            "badge2": ("Distraction Free", "Zero ads or interruptions", (16, 185, 129)),
        }
    ]

    # Preload Fonts
    f_pill = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 24)
    f_title = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 64)
    f_sub = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 31)
    f_badge = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 23)
    f_badge_sub = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 19)

    for i, cfg in enumerate(configs):
        print(f"Generating [{i+1}/6]: {cfg['title']}...")
        base = Image.new('RGBA', (canvas_w, canvas_h), (11, 14, 21, 255))
        accent_color = cfg['color']

        # Ambient Glow Layer
        glow = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
        gdraw = ImageDraw.Draw(glow)
        
        # Primary accent glow behind phone
        for r in range(520, 0, -10):
            a = int(48 * (1 - r / 520))
            gdraw.ellipse([540 - r, 750 - r, 540 + r, 750 + r], fill=(*accent_color, a))
            
        # Secondary bottom glow
        for r in range(400, 0, -10):
            a = int(30 * (1 - r / 400))
            gdraw.ellipse([880 - r, 1750 - r, 880 + r, 1750 + r], fill=(*accent_color, a))

        base = Image.alpha_composite(base, glow)

        # Phone Geometry
        phone_w, phone_h = 840, 1640
        phone_x = (canvas_w - phone_w) // 2
        phone_y = 480
        bezel = 18
        corner_r = 58

        # Shadow beneath phone
        shadow = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
        sdraw = ImageDraw.Draw(shadow)
        # Deep dark drop shadow
        sdraw.rounded_rectangle(
            [phone_x + 10, phone_y + 40, phone_x + phone_w - 10, phone_y + phone_h + 40],
            radius=corner_r,
            fill=(0, 0, 0, 180)
        )
        # Accent-tinted rim glow
        sdraw.rounded_rectangle(
            [phone_x - 12, phone_y + 15, phone_x + phone_w + 12, phone_y + phone_h + 25],
            radius=corner_r + 10,
            fill=(*accent_color, 40)
        )
        shadow = shadow.filter(ImageFilter.GaussianBlur(38))
        base = Image.alpha_composite(base, shadow)

        # Phone Hardware Chassis
        phone_img = Image.new('RGBA', (phone_w, phone_h), (0, 0, 0, 0))
        pdraw = ImageDraw.Draw(phone_img)
        # Titanium outer border
        pdraw.rounded_rectangle([0, 0, phone_w, phone_h], radius=corner_r, fill=(36, 41, 52), outline=(85, 94, 110), width=2)
        # Inner bezel border
        pdraw.rounded_rectangle([4, 4, phone_w - 4, phone_h - 4], radius=corner_r - 4, fill=(14, 17, 23))

        # Screen inside
        screen_w = phone_w - (bezel * 2)
        screen_h = phone_h - (bezel * 2)
        screen_r = corner_r - bezel

        # Load real screenshot
        src_img = Image.open(cfg['source']).convert('RGBA')
        src_resized = src_img.resize((screen_w, screen_h), Image.Resampling.LANCZOS)

        # Screen mask
        mask = Image.new('L', (screen_w, screen_h), 0)
        mdraw = ImageDraw.Draw(mask)
        mdraw.rounded_rectangle([0, 0, screen_w, screen_h], radius=screen_r, fill=255)

        phone_img.paste(src_resized, (bezel, bezel), mask)

        # Front Camera Hole-Punch
        cam_x = phone_w // 2
        cam_y = bezel + 22
        pdraw.ellipse([cam_x - 14, cam_y - 14, cam_x + 14, cam_y + 14], fill=(8, 10, 14), outline=(32, 38, 48), width=2)
        pdraw.ellipse([cam_x - 5, cam_y - 5, cam_x + 5, cam_y + 5], fill=(20, 32, 50))

        # Subtle specular glass sheen across top corner
        sheen = Image.new('RGBA', (screen_w, screen_h), (0, 0, 0, 0))
        sh_draw = ImageDraw.Draw(sheen)
        sh_draw.polygon([(0, 0), (screen_w // 2, 0), (0, screen_h // 2)], fill=(255, 255, 255, 16))
        sheen_masked = Image.composite(sheen, Image.new('RGBA', (screen_w, screen_h), (0,0,0,0)), mask)
        phone_img.alpha_composite(sheen_masked, (bezel, bezel))

        # Paste Phone onto canvas
        base.alpha_composite(phone_img, (phone_x, phone_y))

        # Typography
        draw = ImageDraw.Draw(base)

        # 1. Pill Tag
        tag_text = cfg['tag']
        bbox = draw.textbbox((0, 0), tag_text, font=f_pill)
        pill_w = (bbox[2] - bbox[0]) + 58
        pill_x = (canvas_w - pill_w) // 2
        draw.rounded_rectangle([pill_x, 105, pill_x + pill_w, 160], radius=28, fill=(20, 24, 34), outline=accent_color, width=2)
        # Pill accent dot
        draw.ellipse([pill_x + 20, 127, pill_x + 32, 139], fill=accent_color)
        draw.text((pill_x + 44, 117), tag_text, fill=accent_color, font=f_pill)

        # 2. Headline
        title_text = cfg['title']
        bbox = draw.textbbox((0, 0), title_text, font=f_title)
        t_w = bbox[2] - bbox[0]
        draw.text(((canvas_w - t_w) // 2, 185), title_text, fill=(255, 255, 255), font=f_title)

        # 3. Subtitle
        sub_text = cfg['subtitle']
        bbox = draw.textbbox((0, 0), sub_text, font=f_sub)
        s_w = bbox[2] - bbox[0]
        draw.text(((canvas_w - s_w) // 2, 280), sub_text, fill=(148, 163, 184), font=f_sub)

        # Floating Badges
        def draw_badge(x, y, title, desc, icon_col):
            b_w, b_h = 350, 96
            # Soft shadow
            b_sh = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
            b_sh_draw = ImageDraw.Draw(b_sh)
            b_sh_draw.rounded_rectangle([x + 6, y + 16, x + b_w + 6, y + b_h + 16], radius=24, fill=(0, 0, 0, 160))
            b_sh = b_sh.filter(ImageFilter.GaussianBlur(16))
            base.alpha_composite(b_sh)

            # Badge Body
            b_card = Image.new('RGBA', (b_w, b_h), (0, 0, 0, 0))
            bc_draw = ImageDraw.Draw(b_card)
            bc_draw.rounded_rectangle([0, 0, b_w, b_h], radius=24, fill=(20, 24, 35, 235), outline=(*icon_col, 170), width=2)
            # Glowing indicator dot
            bc_draw.ellipse([22, 33, 44, 55], fill=icon_col)
            bc_draw.text((58, 20), title, fill=(255, 255, 255), font=f_badge)
            bc_draw.text((58, 52), desc, fill=(148, 163, 184), font=f_badge_sub)
            base.alpha_composite(b_card, (x, y))

        # Position badges overlapping phone borders
        b1_title, b1_desc, b1_col = cfg['badge1']
        draw_badge(45, 840, b1_title, b1_desc, b1_col)

        b2_title, b2_desc, b2_col = cfg['badge2']
        draw_badge(canvas_w - 350 - 45, 1420, b2_title, b2_desc, b2_col)

        # Save to output locations
        dest_main = os.path.join(output_dir, cfg['filename'])
        dest_web = os.path.join(web_output_dir, cfg['filename'])
        
        rgb_img = base.convert('RGB')
        rgb_img.save(dest_main, quality=95)
        rgb_img.save(dest_web, quality=95)
        print(f"Saved: {dest_main}")

    print("All 6 showcase screenshots generated successfully!")

if __name__ == '__main__':
    create_showcase()
