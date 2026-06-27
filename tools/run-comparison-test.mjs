async function runTest() {
  console.log("🚀 發起 AI 命題對比測試 (Gemini 3.5 Flash vs Groq Llama 3)...");
  console.log("請稍候，後端正在進行各 3 輪 (共 6 次) 的 AI API 真實模擬調用並收集數據...");
  
  const url = "https://tzvnyluqommusppbzyiy.supabase.co/functions/v1/generate-challenge";
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Developer-Secret': 'super-secret-test-token-2026'
    },
    body: JSON.stringify({
      grade: 5,
      isPractice: true,
      testUid: "test-student-123",
      runComparisonTest: true
    })
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`❌ 測試呼叫失敗 (${response.status}):`, text);
    return;
  }

  const data = await response.json();
  console.log("✅ 對比測試數據收集成功！");
  console.log("==============================================================================");
  console.log("                         AI 命題品質與性能對比報告");
  console.log("==============================================================================");
  
  const printModelStats = (name, rounds) => {
    console.log(`\n🤖 模型: ${name}`);
    if (!rounds || rounds.length === 0) {
      console.log("   ❌ 未配置 Key 或未調用成功。");
      return;
    }
    
    let totalTime = 0;
    let totalValid = 0;
    let totalMatch = 0;
    let successCount = 0;
    
    rounds.forEach(r => {
      console.log(`   第 ${r.round} 輪:`);
      console.log(`     - 狀態: ${r.success ? '成功' : '失敗 (' + r.error + ')'}`);
      if (r.success) {
        successCount++;
        console.log(`     - 耗時: ${r.duration} ms`);
        console.log(`     - 題目數量: ${r.count} 題`);
        console.log(`     - 候選字匹配度: ${r.candidateMatchCount} / 12`);
        console.log(`     - 語法合格率 (validateAISentence): ${r.validSentenceCount} / ${r.count}`);
        if (r.samples && r.samples.length > 0) {
          console.log(`     - 例句樣例:`);
          r.samples.forEach(s => {
            console.log(`       * [${s.word}] "${s.sentence}" (${s.zh})`);
          });
        }
        totalTime += r.duration;
        totalValid += r.validSentenceCount;
        totalMatch += r.candidateMatchCount;
      }
    });
    
    if (successCount > 0) {
      console.log(`   -------------------------------------------------`);
      console.log(`   📊 平均性能摘要 (${name}):`);
      console.log(`     - 平均耗時: ${(totalTime / successCount).toFixed(0)} ms`);
      console.log(`     - 平均單字匹配率: ${(totalMatch / successCount).toFixed(1)} / 12`);
      console.log(`     - 平均語法合格率: ${(totalValid / successCount).toFixed(1)} / 12`);
    }
  };
  
  printModelStats("Google Gemini 3.5 Flash", data.results.gemini);
  printModelStats("Groq Llama 3 8B (Llama-3-8b-8192)", data.results.groq);
  console.log("\n==============================================================================");
}

runTest().catch(console.error);
