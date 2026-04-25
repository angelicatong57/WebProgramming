document.addEventListener('DOMContentLoaded', function() {
    const swiper = new Swiper('.mySwiper', {
      allowTouchMove: true,
      simulateTouch: true,

      loop: true,
  
      pagination: {
        el: '.swiper-pagination',
        clickable: true, 
      },
  
      navigation: {
        nextEl: '.swiper-button-next',
        prevEl: '.swiper-button-prev',
      },
  
      on: {
        slideChange: function() {
          const videos = document.querySelectorAll('.swiper-slide video');
          videos.forEach(video => {
            video.pause();
          });
        },
      },
    });

    // Expose globally so product detail script can call update() after changing slides
    window.productSwiper = swiper;
  });