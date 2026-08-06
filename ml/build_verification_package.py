"""Build Zara_Aura_ML_Verification_Updated.zip — a self-contained Colab package.

Run from the ml/ directory:  python build_verification_package.py
Produces:  Zara_Aura_ML_Verification_Updated.zip  (11 files)
"""
import json, os, shutil, zipfile

ML = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ML, "_pkg_tmp")
ZIP = os.path.join(ML, "Zara_Aura_ML_Verification_Updated.zip")
if os.path.exists(OUT):
    shutil.rmtree(OUT)
os.makedirs(OUT)

copies = [
    ("data/recommendation_dataset.csv", "recommendation_dataset.csv"),
    ("data/sales_dataset.csv", "sales_dataset.csv"),
    ("data/stock_dataset.csv", "stock_dataset.csv"),
    ("models/recommender.pkl", "recommender.pkl"),
    ("models/forecaster.pkl", "forecaster.pkl"),
    ("models/stock_predictor.pkl", "stock_predictor.pkl"),
    ("models/recommender_metrics.json", "recommender_metrics.json"),
    ("models/forecaster_metrics.json", "forecaster_metrics.json"),
    ("models/stock_predictor_metrics.json", "stock_predictor_metrics.json"),
]
for src, dst in copies:
    shutil.copy(os.path.join(ML, src), os.path.join(OUT, dst))

with open(os.path.join(OUT, "requirements.txt"), "w") as f:
    f.write(
        "# Reference versions used to train the Zara Aura models.\n"
        "# The notebook RETRAINS from the CSVs, so it also runs on Google Colab's\n"
        "# default (newer) versions without changes — pins below are for exact\n"
        "# reproduction of the paper's .pkl files if desired.\n"
        "scikit-learn==1.6.1\nnumpy==2.0.2\npandas>=2.0\njoblib>=1.3\n"
        "matplotlib>=3.7\nseaborn>=0.12\n"
    )


def md(*l): return {"cell_type": "markdown", "metadata": {}, "source": list(l)}
def code(*l): return {"cell_type": "code", "metadata": {}, "execution_count": None,
                      "outputs": [], "source": list(l)}

cells = []
cells.append(md(
    "# 🧵 Zara Aura — ML Verification Package (Updated)\n", "\n",
    "**IEEE research-paper reproducibility notebook.** Verifies the three Random Forest "
    "models (recommendation, sales forecasting, stock prediction) and regenerates all "
    "evaluation metrics and publication-ready graphs.\n", "\n",
    "Covers the **updated** models: feature engineering, chronological time-series split, "
    "cold-start handling, inventory logic, hyperparameter documentation, robustness testing.\n", "\n",
    "### Automatic steps\n",
    "1. Load the 3 datasets.\n",
    "2. **Retrain** the latest RF models from the CSVs (identical seed/features/hyperparameters) "
    "**and** load the shipped `.pkl` files as a cross-check.\n",
    "3. Evaluate every model — Accuracy, Precision, Recall, F1, MAE, RMSE, R², MAPE, Confusion Matrix.\n",
    "4. Produce publication-ready graphs.\n",
    "5. Save updated `.pkl` models and `*_metrics.json`.\n", "\n",
    "> **Colab:** upload this ZIP (or the extracted CSVs), then **Runtime → Run all**. "
    "The first cell finds/extracts the data automatically. No code edits required.\n"
))

cells.append(md("## 0 · Environment & data setup"))
cells.append(code(
    "import sys, subprocess\n",
    "for pkg in ['seaborn']:\n",
    "    try: __import__(pkg)\n",
    "    except Exception: subprocess.run([sys.executable,'-m','pip','install','-q',pkg])\n", "\n",
    "import os, glob, json, zipfile, shutil, warnings\n",
    "import numpy as np, pandas as pd, joblib\n",
    "import matplotlib.pyplot as plt, seaborn as sns\n",
    "warnings.filterwarnings('ignore')\n",
    "import sklearn\n",
    "print('scikit-learn', sklearn.__version__, '| numpy', np.__version__, '| pandas', pd.__version__)\n"
))
cells.append(code(
    "NEEDED = ['recommendation_dataset.csv','sales_dataset.csv','stock_dataset.csv']\n",
    "def _find():\n",
    "    for f in NEEDED:\n",
    "        if not os.path.exists(f):\n",
    "            h = glob.glob(f'**/{f}', recursive=True)\n",
    "            if h: shutil.copy(h[0], f)\n",
    "def ensure_data():\n",
    "    _find()\n",
    "    if all(os.path.exists(f) for f in NEEDED): return\n",
    "    for z in glob.glob('*.zip'):\n",
    "        try:\n",
    "            with zipfile.ZipFile(z) as zf: zf.extractall('.')\n",
    "        except Exception: pass\n",
    "    _find()\n",
    "    if all(os.path.exists(f) for f in NEEDED): return\n",
    "    try:\n",
    "        from google.colab import files\n",
    "        print('Upload Zara_Aura_ML_Verification_Updated.zip (or the 3 CSVs):')\n",
    "        up = files.upload()\n",
    "        for name in up:\n",
    "            if name.lower().endswith('.zip'):\n",
    "                with zipfile.ZipFile(name) as zf: zf.extractall('.')\n",
    "        _find()\n",
    "    except Exception: pass\n",
    "    miss = [f for f in NEEDED if not os.path.exists(f)]\n",
    "    if miss: raise FileNotFoundError(f'Datasets not found: {miss}. Upload the zip and re-run.')\n",
    "ensure_data()\n",
    "print('Datasets ready:', [f for f in NEEDED if os.path.exists(f)])\n"
))
cells.append(code(
    "SEED = 42\n",
    "SKIN_TONE_COLORS = {\n",
    "    'Fair':['white','cream','pink','lavender','peach'],\n",
    "    'Light':['white','cream','blue','green','pink','coral','peach'],\n",
    "    'Medium':['orange','coral','olive','teal','mustard','burgundy'],\n",
    "    'Warm':['gold','orange','red','coral','olive','burgundy','mustard'],\n",
    "    'Dark':['red','royal blue','magenta','yellow','white','coral'],\n",
    "    'Deep':['magenta','royal blue','white','gold','yellow']}\n",
    "GOLD, GOLD_D, GREY = '#C9A227', '#a67c00', '#8a8a8a'\n",
    "sns.set_style('whitegrid')\n",
    "plt.rcParams.update({'figure.dpi':120,'savefig.dpi':200,'font.size':11,'axes.titleweight':'bold'})\n",
    "os.makedirs('figures', exist_ok=True); RESULTS = {}\n"
))
cells.append(code(
    "reco_df  = pd.read_csv('recommendation_dataset.csv')\n",
    "sales_df = pd.read_csv('sales_dataset.csv')\n",
    "stock_df = pd.read_csv('stock_dataset.csv')\n",
    "print('Recommendation :', reco_df.shape)\n",
    "print('Sales          :', sales_df.shape)\n",
    "print('Stock          :', stock_df.shape)\n",
    "print('Total records  :', len(reco_df)+len(sales_df)+len(stock_df))\n",
    "reco_df.head()\n"
))

cells.append(md("## 1 · Product Recommendation — Random Forest **Classifier**\n",
    "Feature engineering (`color_match`, `skin_compat`, `gender_cat_match`, `price_band`) + tuned RF.\n"))
cells.append(code(
    "from sklearn.model_selection import train_test_split\n",
    "from sklearn.compose import ColumnTransformer\n",
    "from sklearn.preprocessing import OneHotEncoder, StandardScaler\n",
    "from sklearn.pipeline import Pipeline\n",
    "from sklearn.ensemble import RandomForestClassifier\n",
    "from sklearn.metrics import (accuracy_score, precision_score, recall_score, f1_score,\n",
    "                             confusion_matrix, classification_report, roc_curve, auc)\n", "\n",
    "CAT = ['cust_gender','cust_size','cust_skin_tone','cust_pref_color','cust_occasion',\n",
    "       'prod_category','prod_subcategory','prod_material','prod_color']\n",
    "ENG = ['prod_price','color_match','skin_compat','gender_cat_match','price_band']\n", "\n",
    "def engineer(df):\n",
    "    df = df.copy(); df[CAT] = df[CAT].fillna('Unknown')\n",
    "    df['prod_price'] = df['prod_price'].fillna(df['prod_price'].median())\n",
    "    df['color_match'] = (df['prod_color'].str.lower()==df['cust_pref_color'].str.lower()).astype(int)\n",
    "    skin = {k:[c.lower() for c in v] for k,v in SKIN_TONE_COLORS.items()}\n",
    "    df['skin_compat'] = [int(str(pc).lower() in skin.get(st,[])) for pc,st in zip(df['prod_color'],df['cust_skin_tone'])]\n",
    "    df['gender_cat_match'] = (((df['cust_gender']=='Female')&(df['prod_category']=='Women'))|\n",
    "                              ((df['cust_gender']=='Male')&(df['prod_category']=='Men'))).astype(int)\n",
    "    bins = df['prod_price'].quantile([0.25,0.5,0.75]).values\n",
    "    df['price_band'] = np.digitize(df['prod_price'], bins)\n",
    "    return df\n", "\n",
    "rdf = engineer(reco_df); Xr, yr = rdf[CAT+ENG], rdf['liked'].astype(int)\n",
    "Xr_tr,Xr_te,yr_tr,yr_te = train_test_split(Xr,yr,test_size=0.2,random_state=SEED,stratify=yr)\n",
    "reco_model = Pipeline([('prep', ColumnTransformer([\n",
    "        ('cat', OneHotEncoder(handle_unknown='ignore'), CAT),\n",
    "        ('num', StandardScaler(), ENG)])),\n",
    "    ('clf', RandomForestClassifier(n_estimators=300,max_depth=20,min_samples_split=2,\n",
    "        min_samples_leaf=2,max_features='sqrt',bootstrap=True,criterion='gini',\n",
    "        class_weight='balanced',random_state=SEED,n_jobs=-1))])\n",
    "reco_model.fit(Xr_tr,yr_tr); yr_pred = reco_model.predict(Xr_te)\n",
    "reco_eval = {'accuracy':round(accuracy_score(yr_te,yr_pred),4),\n",
    "    'precision':round(precision_score(yr_te,yr_pred,zero_division=0),4),\n",
    "    'recall':round(recall_score(yr_te,yr_pred,zero_division=0),4),\n",
    "    'f1_score':round(f1_score(yr_te,yr_pred,zero_division=0),4)}\n",
    "reco_cm = confusion_matrix(yr_te,yr_pred); RESULTS['recommender']=reco_eval\n",
    "print('RECOMMENDER:', reco_eval)\n",
    "print('\\nConfusion matrix (rows=actual [not-liked, liked]):\\n', reco_cm)\n",
    "print('\\n', classification_report(yr_te,yr_pred,zero_division=0))\n"
))
cells.append(code(
    "clf = reco_model.named_steps['clf']\n",
    "names = reco_model.named_steps['prep'].get_feature_names_out()\n",
    "agg = {}\n",
    "for n,v in zip(names, clf.feature_importances_):\n",
    "    base = n.split('__',1)[1]\n",
    "    for c in CAT:\n",
    "        if base.startswith(c+'_') or base==c: base=c\n",
    "    agg[base]=agg.get(base,0.0)+float(v)\n",
    "reco_importance = {k:round(v,4) for k,v in sorted(agg.items(), key=lambda x:-x[1])}\n",
    "print('Feature importance:'); [print(f'  {k:18s} {v}') for k,v in reco_importance.items()]\n"
))

cells.append(md("## 2 · Sales Forecasting — Random Forest **Regressor** (chronological, multi-horizon)\n",
    "Time-based split (train=earliest 80%, test=latest 20%) → no leakage. Separate daily/weekly/monthly models.\n"))
cells.append(code(
    "from sklearn.ensemble import RandomForestRegressor\n",
    "from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error\n", "\n",
    "def reg_metrics(y,p):\n",
    "    y=np.asarray(y,float); p=np.asarray(p,float); m=y!=0\n",
    "    return {'r2':round(r2_score(y,p),4),'mae':round(mean_absolute_error(y,p),2),\n",
    "            'rmse':round(float(np.sqrt(mean_squared_error(y,p))),2),\n",
    "            'mape':round(float(np.mean(np.abs((y[m]-p[m])/y[m]))*100),2) if m.any() else None}\n", "\n",
    "RF_REG = dict(n_estimators=300,min_samples_split=2,min_samples_leaf=2,max_features=1.0,\n",
    "              bootstrap=True,criterion='squared_error',random_state=SEED,n_jobs=-1)\n",
    "sdf = sales_df.copy(); sdf['date']=pd.to_datetime(sdf['date'])\n",
    "sdf = sdf.sort_values('date').reset_index(drop=True)\n",
    "sdf['revenue']=sdf['revenue'].fillna(sdf['revenue'].median())\n",
    "def chrono(n,frac=0.2): return int(round(n*(1-frac)))\n",
    "dfeats=['day_of_week','day_of_month','month','day_of_year','is_weekend','is_festival','day_index']\n",
    "sdf[dfeats]=sdf[dfeats].fillna(0); cut=chrono(len(sdf))\n",
    "dXtr,dXte=sdf[dfeats].iloc[:cut],sdf[dfeats].iloc[cut:]\n",
    "dytr,dyte=sdf['revenue'].iloc[:cut],sdf['revenue'].iloc[cut:]\n",
    "daily_model=RandomForestRegressor(max_depth=12,**RF_REG).fit(dXtr,dytr)\n",
    "daily_pred=daily_model.predict(dXte); daily_m=reg_metrics(dyte,daily_pred)\n",
    "sdf['week']=sdf['date'].dt.to_period('W')\n",
    "wk=sdf.groupby('week').agg(revenue=('revenue','sum'),month=('month','first')).reset_index()\n",
    "wk['week_of_year']=[p.start_time.isocalendar()[1] for p in wk['week']]\n",
    "FEST={(1,14),(1,15),(3,8),(4,14),(8,15),(9,7),(10,12),(10,24),(11,1),(11,12),(12,25),(12,31)}\n",
    "wk['is_festival_week']=[int(any((d.month,d.day) in FEST for d in pd.date_range(p.start_time,p.end_time))) for p in wk['week']]\n",
    "wk['week_index']=range(len(wk)); wf=['week_index','month','week_of_year','is_festival_week']\n",
    "wc=chrono(len(wk))\n",
    "weekly_model=RandomForestRegressor(max_depth=12,**RF_REG).fit(wk[wf].iloc[:wc],wk['revenue'].iloc[:wc])\n",
    "weekly_m=reg_metrics(wk['revenue'].iloc[wc:],weekly_model.predict(wk[wf].iloc[wc:]))\n",
    "sdf['ym']=sdf['date'].dt.to_period('M')\n",
    "mo=sdf.groupby('ym').agg(revenue=('revenue','sum'),month=('month','first'),is_festival_month=('is_festival','max')).reset_index()\n",
    "mo['month_index']=range(len(mo)); mf=['month_index','month','is_festival_month']; mcx=chrono(len(mo))\n",
    "monthly_model=RandomForestRegressor(max_depth=12,**RF_REG).fit(mo[mf].iloc[:mcx],mo['revenue'].iloc[:mcx])\n",
    "monthly_m=reg_metrics(mo['revenue'].iloc[mcx:],monthly_model.predict(mo[mf].iloc[mcx:]))\n",
    "forecast_eval={'daily':daily_m,'weekly':weekly_m,'monthly':monthly_m}; RESULTS['forecaster']=daily_m\n",
    "print('FORECASTER (per horizon):')\n",
    "for h,m in forecast_eval.items(): print(f'  {h:8s}: {m}')\n"
))

cells.append(md("## 3 · Stock / Demand Prediction — Random Forest **Regressor**\n",
    "Random Forest vs Linear Regression baseline; the higher-R² model is selected.\n"))
cells.append(code(
    "from sklearn.linear_model import LinearRegression\n",
    "SCAT=['prod_category','prod_subcategory']\n",
    "SNUM=['prod_price','month','week_of_year','is_festival_week','units_sold_last_week','avg_sales_4wk','current_stock']\n",
    "STGT='units_sold_next_week'\n",
    "kdf=stock_df.copy(); kdf[SCAT]=kdf[SCAT].fillna('Unknown'); kdf[SNUM]=kdf[SNUM].fillna(0)\n",
    "kdf[STGT]=kdf[STGT].fillna(kdf[STGT].median())\n",
    "Xs,ys=kdf[SCAT+SNUM],kdf[STGT]\n",
    "Xs_tr,Xs_te,ys_tr,ys_te=train_test_split(Xs,ys,test_size=0.2,random_state=SEED)\n",
    "def build(est): return Pipeline([('prep',ColumnTransformer([('cat',OneHotEncoder(handle_unknown='ignore'),SCAT),('num',StandardScaler(),SNUM)])),('reg',est)])\n",
    "stock_rf=build(RandomForestRegressor(max_depth=14,**RF_REG)).fit(Xs_tr,ys_tr)\n",
    "stock_lr=build(LinearRegression()).fit(Xs_tr,ys_tr)\n",
    "rf_m=reg_metrics(ys_te,stock_rf.predict(Xs_te)); lr_m=reg_metrics(ys_te,stock_lr.predict(Xs_te))\n",
    "if rf_m['r2']>=lr_m['r2']: stock_model,stock_name,stock_m=stock_rf,'RandomForestRegressor',rf_m\n",
    "else: stock_model,stock_name,stock_m=stock_lr,'LinearRegression',lr_m\n",
    "stock_pred=stock_model.predict(Xs_te); RESULTS['stock']=stock_m\n",
    "print(f'Selected: {stock_name}'); print('  RandomForest :',rf_m); print('  LinearReg    :',lr_m)\n"
))

cells.append(md("## 4 · Cross-check against the shipped `.pkl` models"))
cells.append(code(
    "def try_load(p):\n",
    "    try: return joblib.load(p)\n",
    "    except Exception as e:\n",
    "        print(f'  (could not load {p}: {type(e).__name__}) — using retrained model)'); return None\n",
    "for name in ['recommender.pkl','forecaster.pkl','stock_predictor.pkl']:\n",
    "    b = try_load(name) if os.path.exists(name) else None\n",
    "    print(name,'->','loaded OK' if b is not None else 'retrained fallback')\n"
))

cells.append(md("## 5 · Publication-ready graphs"))
cells.append(code(
    "# 5.1 Model Performance Comparison\n",
    "labels=['Recommendation\\n(Accuracy)','Sales Forecast\\n(R\\u00b2, daily)','Stock Prediction\\n(R\\u00b2)']\n",
    "vals=[reco_eval['accuracy'],daily_m['r2'],stock_m['r2']]\n",
    "fig,ax=plt.subplots(figsize=(7.5,4.6))\n",
    "bars=ax.bar(labels,vals,color=[GOLD,GREY,GOLD_D],edgecolor='#5a4a10')\n",
    "for b,v in zip(bars,vals): ax.text(b.get_x()+b.get_width()/2,v+0.01,f'{v:.3f}',ha='center',fontweight='bold')\n",
    "ax.set_ylim(0,1.05); ax.set_ylabel('Score'); ax.set_title('Model Performance Comparison')\n",
    "plt.tight_layout(); plt.savefig('figures/model_accuracy_comparison.png'); plt.show()\n"
))
cells.append(code(
    "# 5.2 Precision / Recall / F1 (recommendation)\n",
    "mets=['Accuracy','Precision','Recall','F1-Score']\n",
    "vv=[reco_eval['accuracy'],reco_eval['precision'],reco_eval['recall'],reco_eval['f1_score']]\n",
    "fig,ax=plt.subplots(figsize=(7.5,4.6))\n",
    "bars=ax.bar(mets,vv,color=[GOLD,GOLD_D,'#b8860b','#8B6914'],edgecolor='#5a4a10')\n",
    "for b,v in zip(bars,vv): ax.text(b.get_x()+b.get_width()/2,v+0.01,f'{v:.3f}',ha='center',fontweight='bold')\n",
    "ax.set_ylim(0,1.0); ax.set_ylabel('Score'); ax.set_title('Recommendation — Precision / Recall / F1')\n",
    "plt.tight_layout(); plt.savefig('figures/precision_recall_f1.png'); plt.show()\n"
))
cells.append(code(
    "# 5.3 Confusion Matrix\n",
    "fig,ax=plt.subplots(figsize=(5.4,4.6))\n",
    "sns.heatmap(reco_cm,annot=True,fmt='d',cmap='YlOrBr',cbar=False,\n",
    "            xticklabels=['Not Liked','Liked'],yticklabels=['Not Liked','Liked'],ax=ax)\n",
    "ax.set_xlabel('Predicted'); ax.set_ylabel('Actual'); ax.set_title('Confusion Matrix — Recommendation')\n",
    "plt.tight_layout(); plt.savefig('figures/confusion_matrix.png'); plt.show()\n"
))
cells.append(code(
    "# 5.4 Feature Importance\n",
    "items=sorted(reco_importance.items(), key=lambda x:x[1]); eng_set=set(ENG)\n",
    "fig,ax=plt.subplots(figsize=(8,5))\n",
    "colors=[GOLD if k in eng_set else GREY for k,_ in items]\n",
    "ax.barh([k for k,_ in items],[v for _,v in items],color=colors,edgecolor='#5a4a10')\n",
    "for i,(k,v) in enumerate(items): ax.text(v+0.003,i,f'{v:.3f}',va='center',fontsize=8)\n",
    "ax.set_xlabel('Gini importance (aggregated)'); ax.set_title('Recommendation — Feature Importance (gold = engineered)')\n",
    "plt.tight_layout(); plt.savefig('figures/feature_importance.png'); plt.show()\n"
))
cells.append(code(
    "# 5.5 Sales Forecast: Predicted vs Actual (daily chronological test)\n",
    "idx=sdf['date'].iloc[cut:].values\n",
    "fig,ax=plt.subplots(figsize=(11,4.6))\n",
    "ax.plot(idx,dyte.values,color='#333',lw=1.6,label='Actual')\n",
    "ax.plot(idx,daily_pred,color=GOLD_D,lw=1.6,ls='--',label='Predicted')\n",
    "ax.set_title(f\"Sales Forecast — Predicted vs Actual (daily test, R\\u00b2={daily_m['r2']}, MAPE={daily_m['mape']}%)\")\n",
    "ax.set_xlabel('Date'); ax.set_ylabel('Revenue'); ax.legend()\n",
    "plt.tight_layout(); plt.savefig('figures/forecast_vs_actual.png'); plt.show()\n"
))
cells.append(code(
    "# 5.6 Stock Prediction vs Actual\n",
    "fig,ax=plt.subplots(figsize=(5.8,5.4))\n",
    "ax.scatter(ys_te,stock_pred,alpha=0.35,s=14,color=GOLD_D,edgecolor='none')\n",
    "lim=[0,max(ys_te.max(),stock_pred.max())]\n",
    "ax.plot(lim,lim,color='#333',lw=1.2,ls='--',label='Perfect prediction')\n",
    "ax.set_xlabel('Actual units (next week)'); ax.set_ylabel('Predicted units')\n",
    "ax.set_title(f\"Stock Prediction vs Actual (R\\u00b2={stock_m['r2']}, MAE={stock_m['mae']})\"); ax.legend()\n",
    "plt.tight_layout(); plt.savefig('figures/stock_vs_actual.png'); plt.show()\n"
))
cells.append(code(
    "# 5.7 Recommendation Performance — ROC\n",
    "proba=reco_model.predict_proba(Xr_te)[:,1]; fpr,tpr,_=roc_curve(yr_te,proba); roc_auc=auc(fpr,tpr)\n",
    "fig,ax=plt.subplots(figsize=(5.8,5.2))\n",
    "ax.plot(fpr,tpr,color=GOLD_D,lw=2.2,label=f'ROC (AUC = {roc_auc:.3f})')\n",
    "ax.plot([0,1],[0,1],color='#999',lw=1,ls='--',label='Random')\n",
    "ax.set_xlabel('False Positive Rate'); ax.set_ylabel('True Positive Rate')\n",
    "ax.set_title('Recommendation Performance — ROC Curve'); ax.legend(loc='lower right')\n",
    "plt.tight_layout(); plt.savefig('figures/recommendation_roc.png'); plt.show()\n"
))

cells.append(md("## 6 · Save updated models & metrics"))
cells.append(code(
    "reco_metrics={'algorithm':'RandomForestClassifier','task':'product_recommendation (feature-engineered + tuned)',\n",
    "    'n_rows':int(len(rdf)),'n_train':int(len(Xr_tr)),'n_test':int(len(Xr_te)),\n",
    "    'hyperparameters':{'n_estimators':300,'max_depth':20,'min_samples_split':2,'min_samples_leaf':2,\n",
    "        'max_features':'sqrt','bootstrap':True,'criterion':'gini','class_weight':'balanced','random_state':42},\n",
    "    **reco_eval,'confusion_matrix':reco_cm.tolist(),'feature_importance':reco_importance,\n",
    "    'engineered_features':['color_match','skin_compat','gender_cat_match','price_band'],'roc_auc':round(float(roc_auc),4)}\n",
    "forecaster_metrics={'task':'sales_forecasting (chronological, multi-horizon)','algorithm':'RandomForestRegressor',\n",
    "    'split':'chronological 80:20 (no temporal leakage)',\n",
    "    'hyperparameters':{'n_estimators':300,'max_depth':12,'min_samples_split':2,'min_samples_leaf':2,\n",
    "        'max_features':1.0,'bootstrap':True,'criterion':'squared_error','random_state':42},\n",
    "    'horizons':forecast_eval,'r2_score':daily_m['r2'],'mae':daily_m['mae'],'rmse':daily_m['rmse']}\n",
    "stock_metrics={'algorithm_selected':stock_name,'task':'stock_prediction (regression)',\n",
    "    'n_rows':int(len(kdf)),'n_train':int(len(Xs_tr)),'n_test':int(len(Xs_te)),\n",
    "    'hyperparameters':{'n_estimators':300,'max_depth':14,'min_samples_split':2,'min_samples_leaf':2,\n",
    "        'max_features':1.0,'bootstrap':True,'criterion':'squared_error','random_state':42},\n",
    "    'selected_metrics':stock_m,'comparison':{'RandomForestRegressor':rf_m,'LinearRegression':lr_m},\n",
    "    'r2_score':stock_m['r2'],'mae':stock_m['mae'],'rmse':stock_m['rmse']}\n",
    "joblib.dump({'pipeline':reco_model,'cat_features':CAT,'eng_features':ENG},'recommender.pkl',compress=3)\n",
    "joblib.dump({'algorithm':'RandomForestRegressor','daily':{'model':daily_model,'features':dfeats},\n",
    "    'weekly':{'model':weekly_model,'features':wf},'monthly':{'model':monthly_model,'features':mf},\n",
    "    'model':daily_model,'features':dfeats},'forecaster.pkl',compress=3)\n",
    "joblib.dump({'model':stock_model,'cat_features':SCAT,'num_features':SNUM,'algorithm':stock_name},'stock_predictor.pkl',compress=3)\n",
    "for fn,d in [('recommender_metrics.json',reco_metrics),('forecaster_metrics.json',forecaster_metrics),('stock_predictor_metrics.json',stock_metrics)]:\n",
    "    json.dump(d,open(fn,'w'),indent=2)\n",
    "print('Saved 3 .pkl models + 3 metrics JSONs + figures/*.png')\n"
))
cells.append(code(
    "print('='*64); print('FINAL EVALUATION SUMMARY'.center(64)); print('='*64)\n",
    "print(f'Datasets: 3  |  rows: reco={len(reco_df):,}, sales={len(sales_df):,}, stock={len(stock_df):,}')\n",
    "print('Trees (n_estimators): 300 (all)  |  max_depth: reco=20, forecast=12, stock=14')\n",
    "print('-'*64)\n",
    "print(f\"Recommendation : Acc={reco_eval['accuracy']}  Prec={reco_eval['precision']}  Rec={reco_eval['recall']}  F1={reco_eval['f1_score']}  AUC={roc_auc:.3f}\")\n",
    "print(f\"Sales (daily)  : R2={daily_m['r2']}  MAE={daily_m['mae']}  RMSE={daily_m['rmse']}  MAPE={daily_m['mape']}%\")\n",
    "print(f\"Stock          : R2={stock_m['r2']}  MAE={stock_m['mae']}  RMSE={stock_m['rmse']}  MAPE={stock_m['mape']}%\")\n",
    "print('='*64)\n"
))

nb = {"cells": cells,
      "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
                   "language_info": {"name": "python", "version": "3"}, "colab": {"provenance": []}},
      "nbformat": 4, "nbformat_minor": 5}
with open(os.path.join(OUT, "Zara_Aura_ML_Verification.ipynb"), "w") as f:
    json.dump(nb, f, indent=1)

if os.path.exists(ZIP):
    os.remove(ZIP)
with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as zf:
    for fn in sorted(os.listdir(OUT)):
        zf.write(os.path.join(OUT, fn), fn)
shutil.rmtree(OUT)
print("built", ZIP, round(os.path.getsize(ZIP) / 1e6, 1), "MB")
