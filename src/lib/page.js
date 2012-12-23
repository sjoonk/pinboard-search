/*
 * Copyright (c) 2012 mono
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

(function() {

var SEARCH_LIMIT = 100;

$(function() {
  var sandbox = (function() {
    var iframe = null;
    var sequence = 0;

    var jsrender = function(template, data) {
      var deferred = $.Deferred();
      var seq = sequence++;
      var messageHandler = function(res) {
        if (res.data.sequence === seq) {
          window.removeEventListener('message', messageHandler);
          deferred.resolve(res.data.html);
        }
      };
      window.addEventListener('message', messageHandler, false);
      iframe.contentWindow.postMessage({
        action: 'jsrender',
        sequence: seq,
        template: template,
        data: data
      }, '*');
      return deferred.promise();
    };

    iframe = document.createElement('iframe');
    iframe.src = 'sandbox.html';
    document.body.appendChild(iframe);

    return {
      jsrender: jsrender
    };
  })();

  var backgroundPage = function() {
    var deferred = $.Deferred();
    chrome.runtime.getBackgroundPage(deferred.resolve);
    return deferred.promise();
  };

  backgroundPage().done(function(background) {
    var search;
    var currentQueryString = null;

    var params = Utils.parseQuery();

    var searchHeader = $('#search-header');
    var queryInput = $('input[name="query"]');
    var searchResult = $('#search-result');
    var mainForm = $('#main-form');

    var sequence = 0;
    var trigger = null;

    var searchNext = function(query, migemo, offset, seq) {
      return search.execute(query, migemo, SEARCH_LIMIT, offset).pipe(function(result) {
        return $.when(result, sandbox.jsrender('search-result-item-template', result));
      }, function() {
        if(offset == 0) {
          searchResult.empty();
          return $.Deferred().reject();
        }
        return $.Deferred().resolve();
      }).pipe(function(result, html) {
        if(sequence != seq) {
          return $.Deferred().reject();
        }
        if(offset == 0) {
          searchResult.html(html);
          searchResult.find('.search-result-item:first-child').addClass('search-result-item-active');
        }
        else {
          searchResult.append(html);
        }
        if(result.length == SEARCH_LIMIT) {
          trigger = $.Deferred().done(function() {
            searchNext(query, migemo, offset + SEARCH_LIMIT, seq);
          });
        }
        else {
          trigger = null;
        }
        return $.Deferred().resolve();
      });
    };

    var onInput = function() {
      var queryString = queryInput.val();
      if(queryString != currentQueryString) {
        currentQueryString = queryString;

        $(window).off('scroll', onScroll);

        background.Pinboard.get([ 'enable_migemo' ]).done(function(data) {
          if(!search) {
            search = new background.Search();
          }
          searchNext(queryString, data.enable_migemo, 0, ++sequence);
        }).done(function() {
          $(window).scrollTop(0).on('scroll', onScroll);
        });
      }
    };

    var onKeyDown = function(e) {
      switch(e.which) {
        case 38: // up
          up();
          e.stopPropagation();
          return false;

        case 40: // down
          down();
          e.stopPropagation();
          return false;

        default:
          break;
      }
      return true;
    }

    var onScroll = function() {
      var top = $(window).scrollTop();
      var height = searchResult.height();
      if(top > height - 1000) {
        if(trigger) {
          trigger.resolve();
          trigger = null;
        }
      }
    };

    var up = function() {
      var active = searchResult.find('.search-result-item-active');
      var prev = active.prev();
      if(prev.length > 0) {
        active.removeClass('search-result-item-active');
        prev.addClass('search-result-item-active');
        scroll(prev);
      }
    };

    var down = function() {
      var active = searchResult.find('.search-result-item-active');
      var next = active.next();
      if(next.length > 0) {
        active.removeClass('search-result-item-active');
        next.addClass('search-result-item-active');
        scroll(next);
      }
    };

    var scroll = function(element) {
      var top = $(window).scrollTop();
      var bottom = $(window).height() + top;
      var offset = element.offset().top;
      var height = element.outerHeight(true);
      var header = searchHeader.height();

      if(offset - top < header) {
        $(window).scrollTop(offset - header);
      }
      else if(offset - (bottom - height) > header) {
        $(window).scrollTop(top + offset + height - bottom - header);
      }
    };

    queryInput.on('input', onInput);
    $(document).on('keydown', onKeyDown);

    mainForm.on('submit', function() {
      var active = searchResult.find('.search-result-item-active');
      if(active.length > 0) {
        location.href = active.find('.search-result-item-link').attr('href');
      }
      return false;
    });

    $(document).on('hover', '.search-result-item', function() {
      var active = searchResult.find('.search-result-item-active');
      if(active != this) {
        active.removeClass('search-result-item-active');
        $(this).addClass('search-result-item-active');
      }
    });

    if(params.query) {
      queryInput.val(params.query);
      onInput();
    }
  });
});

})();