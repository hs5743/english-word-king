async function runTest() {
  console.log("🚀 開始測試 generate-challenge API (適性化出題)...")
  
  const url = "https://tzvnyluqommusppbzyiy.supabase.co/functions/v1/generate-challenge"
  
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
      wrongWords: [],
      testMastery: {
        "apple": 3, "banana": 3, "cat": 3, "dog": 3, "elephant": 3, "fox": 3, "grape": 3, "horse": 3,
        "ice": 3, "juice": 3, "king": 3, "lion": 3, "monkey": 3, "nest": 3, "orange": 3, "pig": 3,
        "queen": 3, "rabbit": 3, "snake": 3, "tiger": 3, "umbrella": 3, "violin": 3, "water": 3, "box": 3,
        "yellow": 3, "zebra": 3, "ant": 3, "bear": 3, "cow": 3, "duck": 3, "frog": 3, "goat": 3,
        "hen": 3, "insect": 3, "jelly": 3, "kangaroo": 3, "lamb": 3, "mouse": 3, "owl": 3, "panda": 3,
        "quail": 3, "rat": 3, "sheep": 3, "turtle": 3, "wolf": 3
      }
    })
  })

  if (!response.ok) {
    const text = await response.text()
    console.error(`❌ API 回傳錯誤 (${response.status}):`, text)
    return
  }

  const data = await response.json()
  console.log("✅ API 呼叫成功！")
  console.log("-----------------------------------------")
  console.log(`- 學生目前稱號: ${data.levelTitle}`)
  console.log(`- 學生等級級數: ${data.levelIndex} / 16`)
  console.log(`- 熟練單字數: ${data.masteredCount} 字`)
  console.log(`- 寶石科普介紹:\n${data.levelDescription}`)
  console.log(`- 距離下一階門檻: ${data.nextLevelThreshold === -1 ? '已封頂' : `還差 ${data.nextLevelThreshold - data.masteredCount} 顆字`}`)
  console.log(`- 出題來源: ${data.source}`)
  console.log("-----------------------------------------")
  console.log("出題列表:")
  data.challengeData.forEach((item, index) => {
    console.log(`[${index + 1}] 單字: ${item.word} (${item.zh}) | 主題: ${item.topic} | 句型: ${item.pattern}`)
    console.log(`    例句: ${item.exampleSentence}`)
    console.log(`    翻譯: ${item.sentenceZh}`)
    console.log(`    填空: ${item.fillBlank}`)
    console.log(`    干擾: ${item.distractors.join(", ")}`)
  })
}

runTest().catch(console.error)
