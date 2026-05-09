/**
 * Scroll Restore Script
 * Reads scrollTo param from URL, scrolls to that position within the chapters element,
 * then clears the param from the URL.
 * Waits for content to be ready before scrolling to ensure accurate positioning.
 */

(function () {
  const url = new URL(window.location.href);
  const scrollToParam = url.searchParams.get('scrollTo');

  if (!scrollToParam) {
    return;
  }

  const scrollPercent = parseInt(scrollToParam, 10);
  if (Number.isNaN(scrollPercent)) {
    return;
  }

  // Clear the scrollTo param from URL immediately to prevent re-execution
  url.searchParams.delete('scrollTo');
  url.searchParams.delete('_t');
  window.history.replaceState({}, '', url.toString());

  function performScroll() {
    const chaptersElement = document.getElementById('chapters');
    if (!chaptersElement) {
      return;
    }

    // Scroll to position within the chapter content
    const elementHeight = chaptersElement.getBoundingClientRect().height;
    const scrollToY = chaptersElement.offsetTop + (elementHeight * scrollPercent) / 100;
    window.scrollTo(0, scrollToY);
  }

  // Wait for document to be fully ready and images to start loading
  if (document.readyState === 'complete') {
    // Small delay to allow layout to stabilize
    setTimeout(performScroll, 100);
  } else {
    window.addEventListener('load', () => {
      setTimeout(performScroll, 100);
    });
  }
})();
