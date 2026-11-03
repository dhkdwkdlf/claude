import sys, subprocess, numpy as np, cv2
src, t0, t1, ref_t, x0,y0,x1,y1 = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), *map(int, sys.argv[5:9])
W,H=1920,1080
def frames(start, dur):
    p=subprocess.Popen(['ffmpeg','-v','error','-ss',str(start),'-t',str(dur),'-i',src,'-f','rawvideo','-pix_fmt','bgr24','-'],stdout=subprocess.PIPE)
    while True:
        b=p.stdout.read(W*H*3)
        if len(b)<W*H*3: break
        yield np.frombuffer(b,np.uint8).reshape(H,W,3)
ref=next(frames(ref_t,0.04))
tpl=ref[y0:y1,x0:x1]
for i,f in enumerate(frames(t0,t1-t0)):
    r=cv2.matchTemplate(f,tpl,cv2.TM_CCOEFF_NORMED); _,mx,_,loc=cv2.minMaxLoc(r)
    reg=f[y0:y1,x0:x1].astype(float); 
    print(f"{t0+i/30:7.3f} loc={loc} score={mx:.3f} mean={reg.mean():6.1f} max={reg.max(axis=2).mean():6.1f}")
