"""부스 안내 영상 부분 수정.

A (1:23~1:29): 잘린 '오리온자리' 라벨을 지우고, 1:36 장면의 온전한 라벨 글자를 조금 줄여 위로 올려 넣는다.
K (1:42~1:49): '나만의 별 키캡을' → '나만의 키캡을' (원본 글자 조각을 옮겨 가운데 정렬).

각 장면은 기준 프레임에서 '수정 전후 차이(D)'를 만들고, 프레임마다 위치(서브픽셀)와 불투명도(a)를 추적해
F' = F + a * shift(D) 로 더한다. 패널이 떠다니거나 글자가 미끄러지며 페이드되어도 그대로 따라간다.

사용: python3 -I patch.py src.mp4 out.mp4 [--preview t1,t2,...]
"""
import subprocess
import sys

import cv2
import numpy as np

W, H, FPS = 1920, 1080, 30
SWS = ["-sws_flags", "accurate_rnd+full_chroma_int+bitexact"]  # 색 변환 반올림 오차(전체가 살짝 어두워짐) 방지
src, out = sys.argv[1], sys.argv[2]
preview = None
if len(sys.argv) > 4 and sys.argv[3] == "--preview":
    preview = [float(t) for t in sys.argv[4].split(",")]


def grab(t):
    b = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.4f}", "-i", src, *SWS, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(b, np.uint8).reshape(H, W, 3).astype(np.float32)


P_IN = np.array([50, 18, 10], np.float32)  # 패널 안쪽 색 (BGR)


class Patch:
    """기준 프레임 좌표의 차이 이미지 D 를 추적해 더한다."""

    def __init__(self, name, t0, t1, ref, tpl_rect, box, D, mask, sky, search=32, content=None, cmask=None, mode="opaque"):
        # content: 기준 좌표의 새 내용 (opaque: 수정된 화면 / layer: 하늘 위에 얹을 글자 층)
        # cmask: content 로 교체할 부드러운 마스크. 차이를 더하지 않고 직접 합성해 페이드 중 잔상을 없앤다.
        self.content, self.cmask, self.mode = content, cmask, mode
        self.name, self.t0, self.t1 = name, t0, t1
        x0, y0, x1, y1 = tpl_rect
        self.tpl = ref[y0:y1, x0:x1].astype(np.uint8)
        self.tpl_xy = (x0, y0)
        self.box = box  # D 가 놓이는 영역 (기준 좌표)
        self.D = D  # box 크기
        self.mask = mask  # box 크기, 불투명도 추정에 쓸 글자 픽셀
        self.R = ref[box[1]:box[3], box[0]:box[2]]
        self.sky = sky  # 전체 프레임 크기, 글자 없는 하늘
        self.search = search

    def track(self, F):
        x0, y0 = self.tpl_xy
        h, w = self.tpl.shape[:2]
        s = self.search
        sx0, sy0 = max(0, x0 - s), max(0, y0 - s)
        win = F[sy0:min(H, y0 + h + s), sx0:min(W, x0 + w + s)].astype(np.uint8)
        r = cv2.matchTemplate(win, self.tpl, cv2.TM_CCOEFF_NORMED)
        _, mx, _, (lx, ly) = cv2.minMaxLoc(r)

        def sub(v_m, v_0, v_p):
            d = v_m - 2 * v_0 + v_p
            return 0.0 if abs(d) < 1e-6 else 0.5 * (v_m - v_p) / d

        fx = sub(r[ly, lx - 1], r[ly, lx], r[ly, lx + 1]) if 0 < lx < r.shape[1] - 1 else 0
        fy = sub(r[ly - 1, lx], r[ly, lx], r[ly + 1, lx]) if 0 < ly < r.shape[0] - 1 else 0
        return sx0 + lx + fx - x0, sy0 + ly + fy - y0, mx

    def apply(self, F, t):
        if not (self.t0 <= t <= self.t1):
            return F, None
        dx, dy, score = self.track(F)
        if score < 0.45:
            return F, (dx, dy, score, 0.0)
        bx0, by0, bx1, by1 = self.box
        bw, bh = bx1 - bx0, by1 - by0
        # 프레임을 기준 좌표로 되돌려 불투명도 추정
        M_back = np.float32([[1, 0, bx0 + dx], [0, 1, by0 + dy]])
        Fw = cv2.warpAffine(F, M_back, (bw, bh), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
        Sw = cv2.warpAffine(self.sky, M_back, (bw, bh), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
        m = self.mask
        num = ((Fw - Sw) * (self.R - Sw))[m].sum()
        den = ((self.R - Sw) ** 2)[m].sum()
        a = float(np.clip(num / max(den, 1e-6), 0, 1))
        if a < 0.02:
            return F, (dx, dy, score, a)
        # D 를 프레임 위치로 옮겨 더함
        ix, iy = int(np.floor(bx0 + dx)) - 2, int(np.floor(by0 + dy)) - 2
        ow, oh = bw + 5, bh + 5
        M = np.float32([[1, 0, bx0 + dx - ix], [0, 1, by0 + dy - iy]])
        cx0, cy0, cx1, cy1 = max(ix, 0), max(iy, 0), min(ix + ow, W), min(iy + oh, H)
        sl = (slice(cy0 - iy, cy1 - iy), slice(cx0 - ix, cx1 - ix))
        F = F.copy()
        if self.content is None:
            Dw = cv2.warpAffine(self.D, M, (ow, oh), flags=cv2.INTER_LINEAR, borderValue=0)
            F[cy0:cy1, cx0:cx1] += a * Dw[sl]
            return F, (dx, dy, score, a)
        Cw = cv2.warpAffine(self.content, M, (ow, oh), flags=cv2.INTER_LINEAR, borderValue=0)[sl]
        Mw = cv2.warpAffine(self.cmask, M, (ow, oh), flags=cv2.INTER_LINEAR, borderValue=0)[sl][..., None]
        sky = self.sky[cy0:cy1, cx0:cx1]
        target = sky * (1 - a) + a * Cw if self.mode == "opaque" else sky + a * Cw
        F[cy0:cy1, cx0:cx1] = F[cy0:cy1, cx0:cx1] * (1 - Mw) + target * Mw
        return F, (dx, dy, score, a)


def alpha_of(R, bg, T):
    v = T - bg
    return np.clip(((R - bg) @ v) / (v @ v), 0, 1)


# ---------------------------------------------------------------- A: 오리온자리 라벨 (1:23~1:29)
refA = grab(88.0)
refB = grab(100.6)  # 같은 라벨이 온전하게 보이는 장면 (빛 번짐이 가장 약한 순간)
skyA = grab(83.2)  # 패널이 나타나기 직전의 하늘
T_B = np.array([115, 213, 252], np.float32)
T_A = np.array([107, 191, 226], np.float32)  # 1:28 라벨 색 (조금 더 차분함)

# 온전한 글자 알파 (1:36 장면): 1360..1578 × 889..949
gx0, gy0, gx1, gy1 = 1354, 885, 1585, 951
alphaB = alpha_of(refB[gy0:gy1, gx0:gx1], P_IN, T_B)
alphaB[alphaB < 0.04] = 0
SCALE = 0.84
gw, gh = round((gx1 - gx0) * SCALE), round((gy1 - gy0) * SCALE)
glyph = cv2.resize(alphaB, (gw, gh), interpolation=cv2.INTER_AREA)
ys, xs = np.where(glyph > 0.3)
g_top, g_bot = ys.min(), ys.max()
g_cx = (xs.min() + xs.max()) / 2

boxA = (1236, 728, 1504, 800)  # 패널 안쪽 하단 (796 이후는 테두리)
bx0, by0, bx1, by1 = boxA
oldA = refA[by0:by1, bx0:bx1].copy()
newA = oldA.copy()
# 1) 잘린 라벨 지우기: 글자 없는 좌우 열 사이를 행마다 직선 보간 (테두리 줄도 가로로 균일해서 그대로 이어짐)
er_y0, er_y1 = 742 - by0, 800 - by0
L, Rr = newA[er_y0:er_y1, 0:1], newA[er_y0:er_y1, -1:]
wts = np.linspace(0, 1, bx1 - bx0, dtype=np.float32)[None, :, None]
newA[er_y0:er_y1] = L * (1 - wts) + Rr * wts
# 2) 온전한 라벨을 별(다리) 아래와 패널 바닥 사이 가운데에 넣기
star_glow_end, inner_bottom = 731, 796
target_top = star_glow_end + ((inner_bottom - star_glow_end) - (g_bot - g_top + 1)) / 2
old_cx = (1260 + 1478) / 2
px = int(round(old_cx - g_cx)) - bx0
py = int(round(target_top - g_top)) - by0
al = np.zeros(newA.shape[:2], np.float32)
al[py:py + gh, px:px + gw] = glyph
newA = newA * (1 - al[..., None]) + T_A * al[..., None]
D_A = (newA - oldA).astype(np.float32)
maskA = alpha_of(oldA, P_IN, T_A) > 0.5
print(f"A: 라벨 {gw}x{g_bot - g_top + 1}px, 위치 y {by0 + py + g_top}..{by0 + py + g_bot} (패널 바닥 {inner_bottom})")
cmA = np.zeros(newA.shape[:2], np.float32)
cmA[742 - by0 + 2:, 8:-8] = 1
cmA = cv2.GaussianBlur(cmA, (0, 0), 2.5)
patchA = Patch("A", 83.15, 89.65, refA, (1250, 735, 1490, 800), boxA, D_A, maskA, skyA, search=20, content=newA.astype(np.float32), cmask=cmA, mode="opaque")

# ---------------------------------------------------------------- K: 나만의 키캡을 (1:42~1:49)
# 글자 그림자는 '글자 알파를 σ=20 으로 흐린 값 × 1.77' 의 검은 그림자로 잘 맞는다 (work/fitshadow.py).
# 둘째 줄 글자 알파만 옮긴 뒤 그림자를 같은 식으로 다시 계산해, 윗줄·아랫줄 그림자와 자연스럽게 겹치게 한다.
refK = grab(105.0)
skyK = grab(102.33)  # 글자가 나타나기 직전의 하늘 (이 장면의 하늘은 움직이지 않음)
boxK = (1000, 340, 1730, 735)  # 세 줄 전체
kx0, ky0, kx1, ky1 = boxK
oldK = refK[ky0:ky1, kx0:kx1].copy()
bgK = skyK[ky0:ky1, kx0:kx1]
YEL = np.array([90, 205, 252], np.float32)
WHT = np.array([245, 245, 245], np.float32)


def alpha_vs(col):
    v = col[None, None, :] - bgK
    return np.clip(((oldK - bgK) * v).sum(2) / np.maximum((v * v).sum(2), 1), 0, 1)


rows = np.arange(ky1 - ky0)[:, None] + ky0
cols = np.arange(kx1 - kx0)[None, :] + kx0
line2 = (rows >= 445) & (rows <= 600)
aY = alpha_vs(YEL) * line2
aW = alpha_vs(WHT) * ~line2
aY[aY < 0.05] = 0
aW[aW < 0.05] = 0
# 하늘의 작은 별이 노란 글자로 잡히지 않게: 큰 글자 덩어리 근처만 남김
n_cc, lab, stats, _ = cv2.connectedComponentsWithStats((aY > 0.5).astype(np.uint8), connectivity=8)
big = np.isin(lab, [i for i in range(1, n_cc) if stats[i, cv2.CC_STAT_AREA] >= 150]).astype(np.uint8)
aY *= cv2.dilate(big, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))).astype(np.float32)
SH_N, SH_K = 53, -55  # '별 ' 을 빼고 가운데(1360) 정렬


def shift_x(img, s):
    out = np.zeros_like(img)
    if s > 0:
        out[:, s:] = img[:, :-s]
    else:
        out[:, :s] = img[:, -s:]
    return out


aY_new = shift_x(aY * (cols < 1318), SH_N) + shift_x(aY * (cols >= 1428), SH_K)
SIG, C = 20, 1.77


def shadow(alpha_all):
    return 1 - np.clip(C * cv2.GaussianBlur(alpha_all, (0, 0), SIG), 0, 1)


f_old = shadow(aW + aY)
f_new = shadow(aW + aY_new)
# 그림자 바뀐 배경 → 둘째 줄(노랑) → 다른 줄(흰 글자)
bg_new = bgK * f_new[..., None]
newK = bg_new * (1 - aY_new[..., None]) + YEL * aY_new[..., None]
newK = newK * (1 - aW[..., None]) + oldK * aW[..., None]
# 교체 영역: 그림자가 달라지는 곳 + 옛/새 글자 자리
change = np.abs(f_new - f_old) + aY + aY_new
cmK = cv2.GaussianBlur((change > 0.004).astype(np.float32), (0, 0), 4)
cmK = np.clip(cmK * 1.3, 0, 1)
newK = oldK * (1 - cmK[..., None]) + newK * cmK[..., None]
D_K = (newK - oldK).astype(np.float32)
sky_full = refK.copy()
sky_full[ky0:ky1, kx0:kx1] = bgK
maskK = aY > 0.5
L_new = (newK - bgK).astype(np.float32)
patchK = Patch("K", 102.35, 108.85, refK, (1050, 480, 1680, 585), boxK, D_K, maskK, sky_full, search=32, content=L_new, cmask=cmK, mode="layer")

patches = [patchA, patchK]

if preview is not None:
    for t in preview:
        F = grab(t)
        for p in patches:
            F, info = p.apply(F, t)
            if info:
                print(f"{t:7.3f} {p.name} dx={info[0]:+.2f} dy={info[1]:+.2f} score={info[2]:.3f} a={info[3]:.2f}")
        cv2.imwrite(f"{out}_{t:07.3f}.png", np.clip(F, 0, 255).astype(np.uint8))
    sys.exit(0)

dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", src, *SWS, "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], stdout=subprocess.PIPE)
enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                        "-i", src, "-map", "0:v", "-map", "1:a", *SWS, "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p",
                        "-profile:v", "high", "-c:a", "copy", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
i = 0
log = []
while True:
    b = dec.stdout.read(W * H * 3)
    if len(b) < W * H * 3:
        break
    t = i / FPS
    if any(p.t0 <= t <= p.t1 for p in patches):
        F = np.frombuffer(b, np.uint8).reshape(H, W, 3).astype(np.float32)
        for p in patches:
            F, info = p.apply(F, t)
            if info:
                log.append(f"{t:7.3f} {p.name} dx={info[0]:+.2f} dy={info[1]:+.2f} score={info[2]:.3f} a={info[3]:.2f}")
        b = np.clip(F + 0.5, 0, 255).astype(np.uint8).tobytes()
    enc.stdin.write(b)
    i += 1
enc.stdin.close()
enc.wait()
open(out + ".log", "w").write("\n".join(log))
print("frames", i)
