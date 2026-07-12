# CP35 內容審核工作區

此目錄保存教師審核用資料，不會被 `build:pages` 發布到正式網站。

## 檔案

- `content-audit-cp35.json`：自動稽核結果；目前列出缺第三句及目標詞形需確認項目。
- `content-review-cp35.csv`：706個單字的人工審核表，可使用 Excel 開啟。

## 審核規則

1. 每個啟用詞義需有三組英文與臺灣繁體中文。
2. 三句都要適合國小、自然、正確，且使用相同 `sense_id`。
3. `example_n_target` 必須填寫句中實際要挖空的英文詞形。
4. 補上 `semantic_group` 與 `part_of_speech`，供安全干擾項演算法使用。
5. 第三例句與既有兩句由 Codex 逐批直接校閱，不使用外部 AI API。
6. 只有所有欄位均確認後，才把 `review_decision` 設為 `approve`。
6. 匯入工具只會核准明確標示 `approve` 且必要欄位完整的資料。

## 指令

```powershell
npm.cmd run audit:content
npm.cmd run export:content-review
npm.cmd run import:content-review
npm.cmd run audit:content:strict
```

`audit:content:strict` 會在第三句不足或仍有未核准例句時失敗，正式切換 CP35 前必須通過。
