/* Public-facing display setting. This does not change data or cross-school functions. */
(function () {
  var mode = 'single-school'
  var homeSchool = '新港國小'
  var single = mode === 'single-school'

  function setText(id, value) {
    var el = document.getElementById(id)
    if (el) el.textContent = value
  }

  function setHtml(id, value) {
    var el = document.getElementById(id)
    if (el) el.innerHTML = value
  }

  function hide(id, shouldHide) {
    var el = document.getElementById(id)
    if (!el) return
    el.hidden = shouldHide
    el.style.display = shouldHide ? 'none' : ''
  }

  function setFooterBrand(selector, value) {
    var footer = document.querySelector(selector)
    if (!footer) return
    var node = Array.prototype.slice.call(footer.childNodes).find(function (child) {
      return child.nodeType === 3 && child.textContent.trim()
    })
    if (node) node.textContent = '\n        ' + value + '\n        '
  }

  function updateMetadata() {
    var isJoin = /(^|\/)join\.html$/.test(window.location.pathname)
    var isHome = /(^|\/)(index\.html)?$/.test(window.location.pathname)
    if (!isHome && !isJoin) return

    var title = isJoin
      ? (single ? '新港國小英語單字王｜學生登入' : '英語單字王｜學生登入')
      : (single ? '新港國小英語單字王｜英語學習與排行榜' : '三校聯網英語單字王｜英語學習與排行榜')
    var description = isJoin
      ? (single ? '使用新港國小學校 Google 帳號登入，開始英語單字學習。' : '使用學校 Google 帳號登入，加入英語單字學習與排名。')
      : (single ? '新港國小英語單字王，提供每日單字挑戰、例句朗讀與個人排行榜。' : '三校聯網英語單字王，提供每日單字挑戰、例句朗讀與跨校排行榜。')
    document.title = title
    var descriptionMeta = document.querySelector('meta[name="description"]')
    var ogTitleMeta = document.querySelector('meta[property="og:title"]')
    var ogDescriptionMeta = document.querySelector('meta[property="og:description"]')
    if (descriptionMeta) descriptionMeta.setAttribute('content', description)
    if (ogTitleMeta) ogTitleMeta.setAttribute('content', title)
    if (ogDescriptionMeta) ogDescriptionMeta.setAttribute('content', description)
  }

  function applyIndex() {
    document.body.classList.toggle('public-mode-single-school', single)
    setText('homeAudienceBadge', single ? homeSchool + '英語學習平台' : '三校聯網英語大對抗')
    setHtml('homeHeroSubtitle', single
      ? '每日挑戰・題庫選題・例句朗讀加分<br>查看個人排行榜，累積學習成就'
      : '鳳岡・豐田・新港三校學生同台競技<br>每日挑戰・題庫選題・例句朗讀加分・跨校排名')
    setText('leaderboard-title', single ? '個人排行榜 Top 10' : '個人積分排行榜 Top 10')
    setText('homeCompetitionFeatureTitle', single ? '個人學習成長' : '三校跨校競技')
    setText('homeCompetitionFeatureText', single
      ? '完成每日挑戰，累積個人分數與學習成就。'
      : '三校共同競賽，與不同學校的同學一起挑戰排行榜。')
    setText('homeCtaDescription', single
      ? '使用新港國小 Google 帳號登入，開始你的英語單字學習。'
      : '使用學校 Google 帳號登入，開始你的英語單字學習。')
    setFooterBrand('.academy-footer p.text-muted', single
      ? '新港國小英語單字王 ｜ '
      : '三校聯網英語單字王 ｜ 鳳岡國小・豐田國小・新港國小 ｜ ')
    hide('school-score-section', single)
    hide('leaderboardTabs', single)

    if (single) {
      var fallback = [
        '每日練習完成，累積你的英語學習成就！',
        '今天挑戰成功，繼續刷新自己的排行榜成績！',
        '完成例句朗讀，為學習之旅增加更多寶石！'
      ]
      var items = document.querySelectorAll('#marqueeTrack .marquee-item > span:not(.marquee-item__dot)')
      Array.prototype.forEach.call(items, function (item, index) {
        item.textContent = fallback[index % fallback.length]
      })
    }
  }

  function applyJoin() {
    document.body.classList.toggle('public-mode-single-school', single)
    setHtml('joinHeroSubtitle', single
      ? '使用新港國小 Google 帳號登入<br>立即開啟你的英語單字學習之旅'
      : '使用學校 Google 帳號登入<br>立即開啟你的英語單字學習之旅')
    setText('joinLoginDescription', single
      ? '使用新港國小學校 Google 帳號登入'
      : '選擇你的學校，再用學校 Google 帳號登入')
    setFooterBrand('.join-academy-footer p.text-muted', single
      ? '新港國小英語單字王 ｜ '
      : '三校聯網英語單字王 ｜ 鳳岡國小・豐田國小・新港國小 ｜ ')
    hide('schoolBadges', single)
    hide('schoolSelectorWrap', single)
    var schoolSelect = document.getElementById('schoolSelect')
    if (schoolSelect && single) {
      schoolSelect.value = homeSchool
      schoolSelect.dataset.school = homeSchool
    }
  }

  window.PublicSiteMode = {
    mode: mode,
    homeSchool: homeSchool,
    isSingleSchool: function () { return single },
    applyIndex: applyIndex,
    applyJoin: applyJoin
  }
  updateMetadata()
})()
