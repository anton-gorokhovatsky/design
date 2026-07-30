#!/usr/bin/env python3
"""Build the recruiter-friendly public PDF resume.

The long-form Notion resume remains the factual source. This script keeps the
public two-page version reproducible and text-based instead of exporting a
flattened screenshot.
"""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = PROJECT_ROOT / "assets" / "anton-gorokhovatsky-resume.pdf"
FONT_ROOT = Path("/System/Library/Fonts/Supplemental")

PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN_X = 18 * mm
MARGIN_TOP = 18 * mm
MARGIN_BOTTOM = 16 * mm

PAPER = colors.HexColor("#F3F2ED")
INK = colors.HexColor("#20211E")
MUTED = colors.HexColor("#66675F")
LINE = colors.HexColor("#D2D1CA")
SIGNAL = colors.HexColor("#536CFF")
SOFT_SIGNAL = colors.HexColor("#E2E6FF")


pdfmetrics.registerFont(TTFont("ResumeRegular", FONT_ROOT / "Arial.ttf"))
pdfmetrics.registerFont(TTFont("ResumeBold", FONT_ROOT / "Arial Bold.ttf"))
pdfmetrics.registerFont(TTFont("ResumeItalic", FONT_ROOT / "Arial Italic.ttf"))
pdfmetrics.registerFontFamily(
    "Resume",
    normal="ResumeRegular",
    bold="ResumeBold",
    italic="ResumeItalic",
)


def style(name, **values):
    base = {
        "fontName": "ResumeRegular",
        "fontSize": 9.2,
        "leading": 12.2,
        "textColor": INK,
        "spaceAfter": 0,
        "allowWidows": 0,
        "allowOrphans": 0,
    }
    base.update(values)
    return ParagraphStyle(name, **base)


NAME = style(
    "Name",
    fontName="ResumeBold",
    fontSize=27,
    leading=26,
    letterSpacing=-0.6,
)
ROLE = style(
    "Role",
    fontName="ResumeBold",
    fontSize=10.2,
    leading=12.5,
    textColor=SIGNAL,
    spaceBefore=5,
)
LEAD = style(
    "Lead",
    fontSize=11.2,
    leading=15.2,
    spaceBefore=11,
)
CONTACT = style(
    "Contact",
    fontSize=8.5,
    leading=11.2,
    textColor=MUTED,
)
SECTION = style(
    "Section",
    fontName="ResumeBold",
    fontSize=8,
    leading=9.5,
    textColor=MUTED,
    letterSpacing=1.1,
    spaceBefore=13,
    spaceAfter=7,
)
JOB_TITLE = style(
    "JobTitle",
    fontName="ResumeBold",
    fontSize=11,
    leading=13,
)
JOB_META = style(
    "JobMeta",
    fontSize=8.2,
    leading=10,
    textColor=MUTED,
)
BODY = style("Body")
SMALL = style(
    "Small",
    fontSize=8.2,
    leading=10.8,
    textColor=MUTED,
)
METRIC = style(
    "Metric",
    fontName="ResumeBold",
    fontSize=16,
    leading=17,
    textColor=SIGNAL,
)
METRIC_LABEL = style(
    "MetricLabel",
    fontSize=7.5,
    leading=9.2,
    textColor=MUTED,
)
FOOTER = style(
    "Footer",
    fontSize=7.5,
    leading=9,
    textColor=MUTED,
    alignment=TA_RIGHT,
)


def page_background(canvas, document):
    canvas.saveState()
    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
    canvas.setFillColor(SIGNAL)
    canvas.rect(MARGIN_X, PAGE_HEIGHT - 10 * mm, 18 * mm, 1.2 * mm, fill=1, stroke=0)
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN_X, 11 * mm, PAGE_WIDTH - MARGIN_X, 11 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont("ResumeRegular", 7)
    canvas.drawString(MARGIN_X, 7.2 * mm, "GOROKHOVATSKY.TECH")
    canvas.drawRightString(
        PAGE_WIDTH - MARGIN_X,
        7.2 * mm,
        f"{document.page} / 2 · ИЮЛЬ 2026",
    )
    canvas.restoreState()


def section_label(text):
    return Paragraph(text.upper(), SECTION)


def bullet_list(items):
    return [
        Paragraph(f"•&nbsp;&nbsp;{item}", BODY)
        for item in items
    ]


def job(title, company, dates, description, bullets=None):
    content = [
        Table(
            [[
                Paragraph(title, JOB_TITLE),
                Paragraph(dates, style("JobDate", **{
                    "fontSize": 8.2,
                    "leading": 10,
                    "textColor": MUTED,
                    "alignment": TA_RIGHT,
                })),
            ]],
            colWidths=[118 * mm, 44 * mm],
            hAlign="LEFT",
        ),
        Paragraph(company, JOB_META),
        Spacer(1, 3.5 * mm),
        Paragraph(description, BODY),
    ]
    if bullets:
        content.extend([Spacer(1, 1.5 * mm), *bullet_list(bullets)])
    content.append(Spacer(1, 4.5 * mm))
    return KeepTogether(content)


def metric_cell(value, label):
    return [
        Paragraph(value, METRIC),
        Spacer(1, 1.2 * mm),
        Paragraph(label, METRIC_LABEL),
    ]


class ResumeDocument(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(
            filename,
            pagesize=A4,
            leftMargin=MARGIN_X,
            rightMargin=MARGIN_X,
            topMargin=MARGIN_TOP,
            bottomMargin=MARGIN_BOTTOM,
            title="Антон Гороховатский — резюме",
            author="Антон Гороховатский",
            subject="Менеджер digital-продуктов, руководитель web-проектов, дизайн-инженер",
            creator="gorokhovatsky.tech / ReportLab",
        )
        frame = Frame(
            MARGIN_X,
            MARGIN_BOTTOM,
            PAGE_WIDTH - 2 * MARGIN_X,
            PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM,
            id="resume",
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        self.addPageTemplates([
            PageTemplate(id="resume-pages", frames=[frame], onPage=page_background),
        ])


def build_story():
    story = [
        Spacer(1, 5 * mm),
        Paragraph("АНТОН ГОРОХОВАТСКИЙ", NAME),
        Paragraph(
            "МЕНЕДЖЕР DIGITAL-ПРОДУКТОВ / РУКОВОДИТЕЛЬ WEB-ПРОЕКТОВ / ДИЗАЙН-ИНЖЕНЕР",
            ROLE,
        ),
        Paragraph(
            "15 лет в digital-проектах: сайты, сервисы, медиа, культурные "
            "и образовательные платформы, внутренние продукты. Работаю на "
            "пересечении продукта, дизайна, управления и разработки.",
            LEAD,
        ),
        Spacer(1, 5 * mm),
        Table(
            [[
                Paragraph(
                    '<link href="mailto:anton.gorokhovatsky@gmail.com" '
                    'color="#20211E">ЭЛ. ПОЧТА</link> · '
                    '<link href="https://t.me/gorokhovatsky" '
                    'color="#20211E">TELEGRAM</link> · '
                    '<link href="https://gorokhovatsky.tech/" '
                    'color="#20211E">ПОРТФОЛИО</link>',
                    CONTACT,
                ),
                Paragraph("МОСКВА / УДАЛЁННО<br/>FULL-TIME / PART-TIME / ПРОЕКТЫ", FOOTER),
            ]],
            colWidths=[103 * mm, 59 * mm],
            hAlign="LEFT",
            style=TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BACKGROUND", (0, 0), (-1, -1), SOFT_SIGNAL),
                ("BOX", (0, 0), (-1, -1), 0, SOFT_SIGNAL),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]),
        ),
        section_label("Профиль"),
        Table(
            [[
                metric_cell("15 ЛЕТ", "В DIGITAL-ПРОЕКТАХ"),
                metric_cell("ДО 10", "ЧЕЛОВЕК В КОМАНДЕ"),
                metric_cell("2020—СЕЙЧАС", "ЧАСТНАЯ ПРАКТИКА"),
            ]],
            colWidths=[54 * mm, 54 * mm, 54 * mm],
            hAlign="LEFT",
            style=TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEABOVE", (0, 0), (-1, 0), 0.5, LINE),
                ("LINEBELOW", (0, 0), (-1, 0), 0.5, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-2, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]),
        ),
        section_label("Ключевая компетенция"),
        Table(
            [[
                Paragraph(
                    "<b>Продукт и исследование</b><br/>"
                    "Постановка задачи, требования, discovery, концепция, "
                    "прототипирование и критерии качества.",
                    BODY,
                ),
                Paragraph(
                    "<b>Управление и доставка</b><br/>"
                    "Клиенты, команды и подрядчики, ресурсы, бюджет, сроки, "
                    "QA, контент, документация и запуск.",
                    BODY,
                ),
            ]],
            colWidths=[79 * mm, 79 * mm],
            hAlign="LEFT",
            style=TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (0, -1), 8),
                ("LEFTPADDING", (1, 0), (1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]),
        ),
        section_label("Опыт"),
        job(
            "ЧАСТНАЯ ПРАКТИКА",
            "Digital-продукты, web-проекты и дизайн-инженерия",
            "НОЯ 2020 — СЕЙЧАС",
            "Исследование, стратегия, структура, прототипы, UX/UI, код и "
            "координация запуска. Подключаюсь к проекту в той роли, которая "
            "быстрее снимает неопределённость и двигает результат.",
        ),
        job(
            "PROJECT MANAGER",
            "OptimalGroup",
            "МАР 2025 — АПР 2026",
            "Сайты, сервисы и CRM для международной корпорации: presale, "
            "сбор требований, клиентская коммуникация, концепции и прототипы, "
            "ресурсы и бюджет, delivery, QA, контент и документация.",
        ),
        job(
            "СТАРШИЙ МЕНЕДЖЕР ПО WEB-РАЗРАБОТКЕ",
            "Музей современного искусства «Гараж»",
            "ОКТ 2021 — МАР 2025",
            "Развитие цифровых продуктов музея: research, discovery и delivery; "
            "координация продуктовой, дизайнерской, контентной и технической "
            "работы; бюджеты, подрядчики и аналитика.",
        ),
        PageBreak(),
        Spacer(1, 5 * mm),
        Paragraph("ОПЫТ / ПРОДОЛЖЕНИЕ", NAME),
        job(
            "DIGITAL-ПРОДЮСЕР",
            "IlmixGroup",
            "МАР 2017 — НОЯ 2020",
            "Цифровые продукты для медицинских и общественных проектов. "
            "Вёл продуктовую логику, контент, дизайн, разработку и развитие.",
        ),
        Table(
            [[
                metric_cell("19 905 → 48 835", "УНИКАЛЬНЫЕ ПОСЕТИТЕЛИ ONCOLOGY.HELP"),
                metric_cell("23,8% → 15,2%", "ПОКАЗАТЕЛЬ ОТКАЗОВ"),
                metric_cell("35,9% → 66,9%", "ДОЛЯ ОРГАНИЧЕСКОГО ТРАФИКА"),
            ]],
            colWidths=[54 * mm, 54 * mm, 54 * mm],
            hAlign="LEFT",
            style=TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BACKGROUND", (0, 0), (-1, -1), SOFT_SIGNAL),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]),
        ),
        section_label("Ранний опыт"),
        Table(
            [
                [
                    Paragraph("<b>РЕДАКТОР САЙТА</b><br/>Фонд «Подари жизнь»", BODY),
                    Paragraph("<b>ОСНОВАТЕЛЬ / МЕНЕДЖЕР ПРОЕКТА</b><br/>Freyaproject", BODY),
                ],
                [
                    Paragraph("<b>МЕНЕДЖЕР ИНТЕРНЕТ-ПРОДВИЖЕНИЯ</b><br/>Ilmix", BODY),
                    Paragraph("<b>КОНТЕНТ-МЕНЕДЖЕР</b><br/>VALLEX M", BODY),
                ],
            ],
            colWidths=[79 * mm, 79 * mm],
            hAlign="LEFT",
            style=TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.5, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]),
        ),
        section_label("Образование"),
        Paragraph(
            "<b>Белгородский государственный университет</b> · 2004—2009<br/>"
            "Прикладная информатика в экономике.",
            BODY,
        ),
        section_label("Инструменты и рабочая среда"),
        Paragraph(
            "Figma, Notion, Jira, HTML/CSS/JavaScript, прототипирование, "
            "аналитика, QA, контентные системы и документация. "
            "Без привязки к одному набору инструментов: выбираю тот, который "
            "соответствует задаче и масштабу команды.",
            BODY,
        ),
        section_label("Ссылки"),
        Paragraph(
            '<link href="https://gorokhovatsky.tech/" color="#536CFF">'
            "GOROKHOVATSKY.TECH</link> — интерактивная карта проектов и опыта<br/>"
            '<link href="https://gorokhovatsky.notion.site/'
            'digital-web-digital-f68fc13247614ccb9738d9a85acf29b4?pvs=74" '
            'color="#536CFF">ПОЛНОЕ РЕЗЮМЕ В NOTION</link> — подробная хронология',
            BODY,
        ),
        Spacer(1, 7 * mm),
        Paragraph(
            "Готов обсудить full-time, part-time и проектную работу. "
            "Актуально на июль 2026 года.",
            SMALL,
        ),
    ]
    return story


def main():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    document = ResumeDocument(str(OUTPUT_PATH))
    document.build(build_story())
    print(f"Built {OUTPUT_PATH.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
