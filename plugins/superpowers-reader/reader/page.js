(function () {
  var main = document.querySelector('main')
  if (!main) return
  var etag = null
  var busy = false
  var started = false

  function highlight() {
    if (typeof hljs === 'undefined') return
    var blocks = main.querySelectorAll('pre > code[data-lang]')
    for (var i = 0; i < blocks.length; i++) {
      var code = blocks[i]
      var language = (code.getAttribute('data-lang') || '').trim().toLowerCase()
      if (!language || !hljs.getLanguage(language)) continue
      code.innerHTML = hljs.highlight(code.textContent, { language: language }).value
      code.classList.add('hljs')
    }
  }

  function lockCheckboxes() {
    var boxes = main.querySelectorAll('input[type=checkbox]')
    for (var i = 0; i < boxes.length; i++) boxes[i].disabled = true
  }

  function openLinksOut() {
    var links = main.querySelectorAll('a[href]')
    for (var i = 0; i < links.length; i++) {
      if (links[i].protocol === 'http:' || links[i].protocol === 'https:') {
        links[i].target = '_blank'
        links[i].rel = 'noopener'
      }
    }
  }

  function decorate() {
    highlight()
    lockCheckboxes()
    openLinksOut()
  }

  function gone() {
    return document.getElementById('reader-gone')
  }

  function showGone() {
    if (gone()) return
    var p = document.createElement('p')
    p.id = 'reader-gone'
    p.textContent = 'This file is gone. Showing its last version.'
    main.parentNode.insertBefore(p, main)
  }

  function clearGone() {
    var p = gone()
    if (p) p.remove()
  }

  // The first element with an id whose top is at or below the viewport top, and where it sits.
  function anchor() {
    var els = main.querySelectorAll('[id]')
    for (var i = 0; i < els.length; i++) {
      var top = els[i].getBoundingClientRect().top
      if (top >= 0) return { id: els[i].id, top: top }
    }
    return null
  }

  function replace(html) {
    var held = anchor()
    main.innerHTML = html
    decorate()
    if (!held) return
    var el = document.getElementById(held.id)
    if (!el) return
    var delta = el.getBoundingClientRect().top - held.top
    if (delta) window.scrollBy(0, delta)
  }

  function poll() {
    if (busy || document.visibilityState !== 'visible') return
    busy = true
    var headers = {}
    if (etag) headers['If-None-Match'] = etag
    fetch(location.pathname + '?fragment=1', { cache: 'no-store', headers: headers })
      .then(function (res) {
        if (res.status === 404) {
          etag = null
          showGone()
          return null
        }
        if (res.status !== 200) return null
        var next = res.headers.get('ETag')
        return res.text().then(function (html) {
          if (next) etag = next
          if (started) replace(html)
          started = true
          clearGone()
        })
      })
      .catch(function () {})
      .then(function () { busy = false })
  }

  decorate()
  poll()
  setInterval(poll, 2000)
  document.addEventListener('visibilitychange', poll)
})()
