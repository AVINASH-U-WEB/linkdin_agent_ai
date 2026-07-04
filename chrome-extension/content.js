chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "EXTRACT_POSTS") {
    const posts = [];

    // Directly target the elements that contain the actual post text
    const textContainers = document.querySelectorAll('.update-components-text, .feed-shared-update-v2__description, div.break-words > span[dir="ltr"], span.break-words');

    textContainers.forEach(container => {
      let text = container.innerText || "";
      // Clean up LinkedIn's truncation text
      text = text.replace(/…see more/gi, "").trim();
      text = text.replace(/…see less/gi, "").trim();
      
      // We only want substantial blocks of text (actual posts), not names or small captions
      // Also ensure we don't add exact duplicates
      if (text.length > 40 && !posts.some(p => p.text === text)) {
        posts.push({ text: text });
      }
    });

    // Fallback: If still nothing, look for any span containing lots of text (very aggressive)
    if (posts.length === 0) {
        const textSpans = document.querySelectorAll('span[dir="ltr"]');
        textSpans.forEach(span => {
            let text = span.innerText || "";
            if (text.length > 60 && !text.includes("Comment") && !text.includes("Like") && !posts.some(p => p.text === text)) {
                posts.push({ text: text });
            }
        });
    }

    sendResponse({ posts: posts });
  }
  return true; 
});

