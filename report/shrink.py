import re, zipfile, os
p = 'ux/word/document.xml'
x = open(p, encoding='utf-8').read()
factors = [0.9, 1.0, 0.85, 0.9, 0.8, 0.9, 0.9, 0.9]
idx = [0]


def drawing(m):
    f = factors[idx[0]]
    idx[0] += 1
    s = m.group(0)
    def sc(mm):
        return f'{mm.group(1)}{int(int(mm.group(2)) * f)}{mm.group(3)}{int(int(mm.group(4)) * f)}'
    s = re.sub(r'(<wp:extent cx=")(\d+)(" cy=")(\d+)', sc, s)
    s = re.sub(r'(<a:ext cx=")(\d+)(" cy=")(\d+)', sc, s)
    return s


x = re.sub(r'<w:drawing>.*?</w:drawing>', drawing, x, flags=re.S)
print('images scaled:', idx[0])
open(p, 'w', encoding='utf-8').write(x)
src = zipfile.ZipFile('Final_Report_backup_your_edits.docx')
with zipfile.ZipFile('Final_Report_new.docx', 'w', zipfile.ZIP_DEFLATED) as z:
    for n in [i.filename for i in src.infolist()]:
        if not n.endswith('/'):
            z.write(os.path.join('ux', n), n)
