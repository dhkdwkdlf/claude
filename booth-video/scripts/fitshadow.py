import cv2, numpy as np
x0,y0,x1,y1=(1000,340,1730,735)
old=cv2.imread('frames/r105.png').astype(np.float32)[y0:y1,x0:x1]
sky=cv2.imread('prev/s_102.33.png').astype(np.float32)[y0:y1,x0:x1]
def alpha_to(col):
    v=col[None,None,:]-sky
    return np.clip(((old-sky)*v).sum(2)/np.maximum((v*v).sum(2),1),0,1)
aY=alpha_to(np.array([90,205,252],np.float32)); aW=alpha_to(np.array([245,245,245],np.float32))
rows=np.arange(y1-y0)[:,None]+y0
line2=(rows>=445)&(rows<=600)
A=np.where(line2,aY,aW)
txt=A>0.5
ratio=(old.mean(2)+1)/(sky.mean(2)+1)
sh=np.clip(1-ratio,0,1)
valid=(~cv2.dilate(txt.astype(np.uint8),None,iterations=2).astype(bool))&(sky.mean(2)<90)
res=[]
for s1 in [2,3,4,6,8]:
  G1=cv2.GaussianBlur(A,(0,0),s1)
  for s2 in [12,16,20,24,30,36]:
    G2=cv2.GaussianBlur(A,(0,0),s2)
    X=np.stack([G1[valid],G2[valid]],1); c,*_=np.linalg.lstsq(X,sh[valid],rcond=None)
    # 겹침 모델: 1-(1-c1G1)(1-c2G2)
    pred=1-(1-np.clip(c[0]*G1,0,1))*(1-np.clip(c[1]*G2,0,1))
    err=((sh-pred)[valid]**2).mean(); res.append((err,s1,s2,c[0],c[1]))
res.sort(); print(res[:4])
err,s1,s2,c1,c2=res[0]
np.save('work/shadow_params.npy',np.array([s1,s2,c1,c2]))
G1=cv2.GaussianBlur(A,(0,0),s1); G2=cv2.GaussianBlur(A,(0,0),s2)
pred=1-(1-np.clip(c1*G1,0,1))*(1-np.clip(c2*G2,0,1))
vis=np.hstack([sh,pred,np.abs(sh-pred)*3]); cv2.imwrite('prev/shfit.png',np.clip(vis*255,0,255).astype(np.uint8)[::2,::2])
