import json, numpy as np, pandas as pd, joblib, warnings
from sklearn.model_selection import train_test_split
from sklearn.metrics import (accuracy_score,precision_score,recall_score,f1_score,
                             r2_score,mean_absolute_error,mean_squared_error)
warnings.filterwarnings("ignore")
rng=np.random.default_rng(42)
def rmse(a,b): return float(np.sqrt(mean_squared_error(a,b)))
def mape(a,b):
    a=np.asarray(a,float); b=np.asarray(b,float); m=a!=0
    return float(np.mean(np.abs((a[m]-b[m])/a[m]))*100)

# ---------- RECOMMENDATION ----------
reco=joblib.load("models/recommender.pkl")
CAT=['cust_gender','cust_size','cust_skin_tone','cust_pref_color','cust_occasion','prod_category','prod_subcategory','prod_material','prod_color']; NUM=['prod_price']
df=pd.read_csv("data/recommendation_dataset.csv"); df[CAT]=df[CAT].fillna('Unknown'); df[NUM]=df[NUM].fillna(df[NUM].median())
X=df[CAT+NUM]; y=df['liked'].astype(int)
Xtr,Xte,ytr,yte=train_test_split(X,y,test_size=0.2,random_state=42,stratify=y)
# feature importances aggregated back to base features
clf=reco.named_steps['clf']; names=reco.named_steps['prep'].get_feature_names_out()
imp=clf.feature_importances_
agg={}
for n,v in zip(names,imp):
    base=n.split('__',1)[1]
    # strip onehot category suffix: cat__cust_gender_Female -> cust_gender
    for c in CAT:
        if base.startswith(c+'_') or base==c: base=c
    for c in NUM:
        if base==c: base=c
    agg[base]=agg.get(base,0)+v
print("RECO feature importance:", {k:round(v,3) for k,v in sorted(agg.items(),key=lambda x:-x[1])})

def reco_scores(Xt):
    p=reco.predict(Xt)
    return dict(acc=round(accuracy_score(yte,p),3),prec=round(precision_score(yte,p),3),
               rec=round(recall_score(yte,p),3),f1=round(f1_score(yte,p),3))
print("RECO baseline:",reco_scores(Xte))
# robustness: missing injection then re-impute
for frac in [0.10,0.20]:
    Xm=Xte.copy().astype(object)
    mask=rng.random(Xm.shape)<frac
    Xm=Xm.mask(mask)
    Xm[CAT]=Xm[CAT].fillna('Unknown'); Xm[NUM]=pd.DataFrame(Xm[NUM]).apply(pd.to_numeric,errors='coerce').fillna(df[NUM].median().iloc[0])
    print(f"RECO missing {int(frac*100)}%:",reco_scores(Xm))

# ---------- FORECAST ----------
fc=joblib.load("models/forecaster.pkl"); F=fc['features']
d=pd.read_csv("data/sales_dataset.csv"); d[F]=d[F].fillna(0); d['revenue']=d['revenue'].fillna(d['revenue'].median())
Xs_tr,Xs,ys_tr,ys=train_test_split(d[F],d['revenue'],test_size=0.2,random_state=42)
ps=fc['model'].predict(Xs)
print("FCAST daily:",dict(r2=round(r2_score(ys,ps),3),mae=round(mean_absolute_error(ys,ps),2),rmse=round(rmse(ys,ps),2),mape=round(mape(ys,ps),2)))
print("FCAST importance:",{k:round(v,3) for k,v in sorted(zip(F,fc['model'].feature_importances_),key=lambda x:-x[1])})
for frac in [0.10,0.20]:
    Xn=Xs.copy().astype(float)
    for c in F:
        s=d[c].std() or 1
        Xn[c]=Xn[c]+rng.normal(0,frac*s,len(Xn))
    pn=fc['model'].predict(Xn)
    print(f"FCAST noise {int(frac*100)}%:",dict(r2=round(r2_score(ys,pn),3),mae=round(mean_absolute_error(ys,pn),2)))

# ---------- STOCK ----------
st=joblib.load("models/stock_predictor.pkl"); Ck,Nk=st['cat_features'],st['num_features']
t=pd.read_csv("data/stock_dataset.csv"); t[Ck]=t[Ck].fillna('Unknown'); t[Nk]=t[Nk].fillna(0); t['units_sold_next_week']=t['units_sold_next_week'].fillna(t['units_sold_next_week'].median())
Xk_tr,Xk,yk_tr,yk=train_test_split(t[Ck+Nk],t['units_sold_next_week'],test_size=0.2,random_state=42)
pk=st['model'].predict(Xk)
print("STOCK:",dict(r2=round(r2_score(yk,pk),3),mae=round(mean_absolute_error(yk,pk),2),rmse=round(rmse(yk,pk),2),mape=round(mape(yk,pk),2)))
reg=st['model'].named_steps['reg']; snames=st['model'].named_steps['prep'].get_feature_names_out()
sagg={}
for n,v in zip(snames,reg.feature_importances_):
    base=n.split('__',1)[1]
    for c in Ck:
        if base.startswith(c+'_') or base==c: base=c
    sagg[base]=sagg.get(base,0)+v
print("STOCK importance:",{k:round(v,3) for k,v in sorted(sagg.items(),key=lambda x:-x[1])})
for frac in [0.10,0.20]:
    Xn=Xk.copy()
    for c in Nk:
        s=t[c].std() or 1
        Xn[c]=Xn[c]+rng.normal(0,frac*s,len(Xn))
    pn=st['model'].predict(Xn)
    print(f"STOCK noise {int(frac*100)}%:",dict(r2=round(r2_score(yk,pn),3),mae=round(mean_absolute_error(yk,pn),2)))
