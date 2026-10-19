"""范増ロールプレイのワークシート（Word）を作る。
授業プリント（古典探究『史記』「鴻門之会」①〜⑪）の体裁に合わせる：A4横・2段組・教科書体・表裏。
実行: python3 tools/worksheet.py  →  docs/worksheets/hanzo-roleplay.docx
必要: python-docx
"""
import os
from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'worksheets', 'hanzo-roleplay.docx')
FONT = 'UD Digi Kyokasho NK-R'
FONT_B = 'UD Digi Kyokasho NK-B'


def set_font(run, size=10, bold=False, color=None):
    run.font.size = Pt(size)
    run.font.bold = False
    name = FONT_B if bold else FONT
    run.font.name = name
    rpr = run._element.get_or_add_rPr()
    fonts = rpr.find(qn('w:rFonts'))
    if fonts is None:
        fonts = OxmlElement('w:rFonts')
        rpr.append(fonts)
    for k in ('w:ascii', 'w:hAnsi', 'w:eastAsia', 'w:cs'):
        fonts.set(qn(k), name)
    if color:
        run.font.color.rgb = RGBColor.from_string(color)


def para(doc, text='', size=10, bold=False, align=None, space_after=2, color=None):
    # 枠の中の最初の段落は、空の既定段落を使い回す
    if not hasattr(doc, 'sections') and len(doc.paragraphs) == 1 and not doc.paragraphs[0].text and not getattr(doc, '_km_used', False):
        p = doc.paragraphs[0]
        doc._km_used = True
    else:
        p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.line_spacing = 1.15
    if align:
        p.alignment = align
    if text:
        set_font(p.add_run(text), size, bold, color)
    return p


def runs(p, parts):
    """parts: [(text, {size, bold, color})]"""
    for t, o in parts:
        set_font(p.add_run(t), o.get('size', 10), o.get('bold', False), o.get('color'))


def borders(table):
    tbl = table._tbl
    pr = tbl.tblPr
    b = OxmlElement('w:tblBorders')
    for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        e = OxmlElement('w:' + edge)
        e.set(qn('w:val'), 'single')
        e.set(qn('w:sz'), '6')
        e.set(qn('w:color'), '000000')
        b.append(e)
    pr.append(b)


def cell(c, text, size=9, bold=False, shade=None):
    c.paragraphs[0].paragraph_format.space_after = Pt(0)
    set_font(c.paragraphs[0].add_run(text), size, bold)
    if shade:
        tcpr = c._tc.get_or_add_tcPr()
        sh = OxmlElement('w:shd')
        sh.set(qn('w:val'), 'clear')
        sh.set(qn('w:color'), 'auto')
        sh.set(qn('w:fill'), shade)
        tcpr.append(sh)


def row_height(row, cm):
    trpr = row._tr.get_or_add_trPr()
    h = OxmlElement('w:trHeight')
    h.set(qn('w:val'), str(int(cm * 567)))
    h.set(qn('w:hRule'), 'atLeast')
    trpr.append(h)


def add_table(where, rows, cols):
    if hasattr(where, 'sections'):
        return where.add_table(rows=rows, cols=cols)
    return where.add_table(rows, cols)


def table(doc, head, rows, widths, heights=0.9, head_shade='EDE7D6'):
    t = add_table(doc, 1 + len(rows), len(head))
    borders(t)
    for i, h in enumerate(head):
        cell(t.rows[0].cells[i], h, 9, True, head_shade)
    for r, vals in enumerate(rows):
        row_height(t.rows[r + 1], heights)
        for i, v in enumerate(vals):
            cell(t.rows[r + 1].cells[i], v, 9)
    for row in t.rows:
        for i, w in enumerate(widths):
            row.cells[i].width = Cm(w)
    return t


def box(doc, lines, height_cm):
    t = add_table(doc, 1, 1)
    borders(t)
    row_height(t.rows[0], height_cm)
    c = t.rows[0].cells[0]
    for i, ln in enumerate(lines):
        p = c.paragraphs[0] if i == 0 else c.add_paragraph()
        p.paragraph_format.space_after = Pt(0)
        set_font(p.add_run(ln), 9)
    return t


def header(doc, side):
    p = para(doc, space_after=4)
    runs(p, [('【古典探究】『史記』「鴻門之会」　AIロールプレイ　授業プリント⑫', {'size': 11, 'bold': True}),
             ('　　二年　　　組　　　　番　氏名　　　　　　　　　　　　　　　　　　　', {'size': 10}),
             (side, {'size': 10, 'bold': True})])
    pb = p._p.get_or_add_pPr()
    bdr = OxmlElement('w:pBdr')
    bot = OxmlElement('w:bottom')
    bot.set(qn('w:val'), 'single'); bot.set(qn('w:sz'), '8'); bot.set(qn('w:color'), '000000')
    bdr.append(bot)
    pb.append(bdr)


def two_columns(section):
    sp = section._sectPr
    cols = sp.find(qn('w:cols'))
    if cols is None:
        cols = OxmlElement('w:cols')
        sp.append(cols)
    cols.set(qn('w:num'), '2')
    cols.set(qn('w:sep'), '1')
    cols.set(qn('w:space'), '425')


def layout(doc):
    """左右二段の枠（罫線は中央の区切りだけ）。各段の幅は 13.2cm"""
    t = doc.add_table(rows=1, cols=2)
    pr = t._tbl.tblPr
    b = OxmlElement('w:tblBorders')
    e = OxmlElement('w:insideV'); e.set(qn('w:val'), 'single'); e.set(qn('w:sz'), '6'); e.set(qn('w:color'), '000000'); b.append(e)
    pr.append(b)
    lay = OxmlElement('w:tblLayout'); lay.set(qn('w:type'), 'fixed'); pr.append(lay)
    for c in t.rows[0].cells:
        c.width = Cm(13.55)
    L, R = t.rows[0].cells
    for c, side in ((L, 'right'), (R, 'left')):
        tcpr = c._tc.get_or_add_tcPr()
        mar = OxmlElement('w:tcMar')
        m = OxmlElement('w:' + side); m.set(qn('w:w'), '240'); m.set(qn('w:type'), 'dxa'); mar.append(m)
        tcpr.append(mar)
    return L, R


def main():
    doc = Document()
    sec = doc.sections[0]
    sec.orientation = WD_ORIENT.LANDSCAPE
    sec.page_width, sec.page_height = Cm(29.7), Cm(21.0)
    for side in ('top_margin', 'bottom_margin', 'left_margin', 'right_margin'):
        setattr(sec, side, Cm(1.27))
    st = doc.styles['Normal']
    st.font.name = FONT
    st.font.size = Pt(10)
    st.element.rPr.rFonts.set(qn('w:eastAsia'), FONT)

    # ======================= 表 =======================
    header(doc, '表')
    L, R = layout(doc)
    para(L, '高祖曰はく、「項羽は一の范増有れども用ゐる能はず。此れ其の我が擒と為る所以なり。」（高祖本紀）', 9.5, color='5A4A2A')
    para(L, '――もし、あなたが范増だったら。樊噲が去り、沛公が「厠へ」と席を立った今が、最後の機会だ。'
            'AIが演じる項王を、本文を根拠にして説得しよう。言葉をかけられるのは五回まで。', 10, space_after=6)
    para(L, '★Ⅰ．説得の根拠を本文から集めよう（書き下し文で書き抜く）', 10.5, True)
    table(L, ['根拠（書き下し文）', '本文の場所', '項王に効きそうな理由'],
          [['', 'P　 ・　 行', ''], ['', 'P　 ・　 行', ''], ['', 'P　 ・　 行', ''], ['', 'P　 ・　 行', '']],
          [6.4, 2.0, 4.4], 1.3)
    para(L, 'ヒント：范増の進言（気を望む）／曹無傷の密告／沛公が関中で財物を取らなかったこと／樊噲の振る舞い', 8.5, color='555555', space_after=6)
    para(L, '★Ⅱ．項王の人物像を押さえよう', 10.5, True)
    para(L, '①　范増は項王を「君王人と為り（　　　　　）」と評した。', 9.5)
    para(L, '　　→ 意味：（　　　　　　　　　　　　　　　　　　　　）', 9.5)
    para(L, '②　項伯の「今人大功有るに之を撃つは、（　　　）なり」に、項王は許諾した。', 9.5)
    para(L, '③　だから項王を動かすには、「沛公を討っても（　　　）にならない」理由が要る。', 9.5)
    para(L, '④　言ってはいけないこと（項王が反発しそうな言い方）', 9.5)
    box(L, ['', ''], 1.4)

    para(R, '★Ⅲ．対話の記録（言葉をかけられるのは五回まで）', 10.5, True)
    table(R, ['回', '范増（自分）の言葉の要点', '項王の返答の要点', '使った本文'],
          [['１', '', '', ''], ['２', '', '', ''], ['３', '', '', ''], ['４', '', '', ''], ['５', '', '', '']],
          [0.8, 4.8, 4.6, 2.6], 2.35)
    para(R, '※ 後の歴史（垓下など）を持ち出すと、項王は「妖言だ」と取り合わない。本文の範囲で勝負しよう。', 8.5, color='555555')

    # ======================= 裏 =======================
    brk = doc.add_paragraph().add_run()
    brk.add_break(WD_BREAK.PAGE)
    header(doc, '裏')
    L, R = layout(doc)
    para(L, 'ⅰ　講評の「説得度」の推移を書き写そう（はじめ20、80以上で成功）', 10.5, True)
    table(L, ['', 'はじめ', '１', '２', '３', '４', '５'],
          [['説得度', '２０', '', '', '', '', ''], ['上下した\n理由', '', '', '', '', '', '']],
          [1.8, 1.4, 1.9, 1.9, 1.9, 1.9, 1.9], 1.2)
    para(L, '', 4)
    para(L, 'ⅱ　説得できた（できなかった）理由を、本文の言葉を使って説明しよう。', 10.5, True)
    box(L, ['', '', '', ''], 4.0)
    para(L, '', 4)
    para(L, 'ⅳ　AIの項王は、本文の項王と同じだったか。違うと感じたところと、その根拠を書こう。', 10.5, True)
    box(L, ['', '', ''], 3.6)

    para(R, 'ⅲ　「項羽は一の范増有れども用ゐる能はず」。項羽が范増を用いることができなかったのはなぜか。'
            '鴻門之会の本文（玉玦・項荘の剣舞・豎子与に謀るに足らず）から考えよう。', 10.5, True)
    box(R, ['', '', '', '', '', ''], 8.6)
    para(R, '', 4)
    para(R, '〈振り返り〉　□ 書き下し文を正確に引用できた　□ 項王の価値観を踏まえて言葉を選べた　□ AIの答えを本文で確かめた', 9, color='555555')
    para(R, '※ AIの答えは誤ることがある。史実や本文の解釈は、教科書・便覧で確かめよう。', 8.5, color='555555')

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    doc.save(OUT)
    print('✔', os.path.relpath(OUT, ROOT))


if __name__ == '__main__':
    main()
