d3.json("sleep.json", function(sleep) {

  // Various formatters.
  var formatNumber = d3.format(",d"),
      formatFloat = d3.format(",.2f"),
      formatChange = d3.format("+,d"),
      formatDate = d3.time.format("%B %d, %Y"),
      formatTime = d3.time.format("%I:%M %p");

  var nights = [];

  function dateDifference(a, b) {
     // The number of milliseconds in one day
     var ONE_DAY = 1000 * 60 * 60 * 24;

     // Convert both dates to milliseconds
     var aTime = a.getTime();
     var bTime = b.getTime();

     // Calculate the difference in milliseconds
     var differenceTime = Math.abs(aTime - bTime);

     // Convert back to days and return
     return Math.round(differenceTime / ONE_DAY);
  }

  function parseDate(d) {
     if (d.hour !== undefined &&
        d.minute !== undefined &&
        d.second !== undefined) {
        return new Date(d.year, d.month, d.day, d.hour, d.minute, d.second);
     }

     return new Date(d.year, d.month, d.day);
  }

  // XXX temporary hack
  var added = {};

  sleep.forEach(function(d, i) {
     var entryDate = parseDate(d.data.startDate);

     if (added[entryDate] !== true) {
        added[entryDate] = true;

        nights.push({
           index: i,
           date: entryDate,
           pillow: parseDate(d.data.bedTime),
           awakenings: d.data.awakenings,
           wake: parseDate(d.data.riseTime),
           hours: d.data.totalZ / 60,
           zq: d.data.zq,
           dayOfWeek: entryDate.getDay(),
           morningFeel: d.data.morningFeel,
           timeInWake: d.data.timeInWake
        });
     }
  });

  // Create the crossfilter for the relevant dimensions and groups.
  var night = crossfilter(nights),
      all = night.groupAll(),

      date = night.dimension(function(d) { return d3.time.day(d.date); }),
      dates = date.group(),

      awakening = night.dimension(function(d) { return d.awakenings; }),
      awakenings = awakening.group(),

      weekday = night.dimension(function(d) { return d.dayOfWeek; }),
      weekdays = weekday.group(),

      zq = night.dimension(function(d) { return d.zq; }),
      zqs = zq.group(),

      pillow = night.dimension(function(d) { return d.pillow.getHours() + d.pillow.getMinutes() / 60; }),
      pillows = pillow.group(Math.floor),

      wake = night.dimension(function(d) { return d.wake.getHours() + d.wake.getMinutes() / 60; }),
      wakes = wake.group(Math.floor),

      hour = night.dimension(function(d) { return d.hours; }),
      hours = hour.group(Math.floor);

  var dateRange = d3.extent(nights, function(night) {
    return night.date;
  });

  var charts = [
    barChart()
        .dimension(pillow)
        .group(pillows)
      .x(d3.scale.linear()
        .domain([0, 24])
        .rangeRound([0, 10 * 24])),

    barChart()
        .dimension(wake)
        .group(wakes)
      .x(d3.scale.linear()
        .domain([0, 24])
        .rangeRound([0, 10 * 24])),

    barChart()
        .dimension(hour)
        .group(hours)
      .x(d3.scale.linear()
        .domain([0, 11])
        .rangeRound([0, 10 * 11])),

    barChart()
        .dimension(awakening)
        .group(awakenings)
      .x(d3.scale.linear()
        .domain([0, 12])
        .rangeRound([0, 10 * 12])),

    barChart()
        .dimension(weekday)
        .group(weekdays)
      .x(d3.scale.linear()
        .domain([0, 7])
        .rangeRound([0, 10 * 7])),

    barChart()
        .dimension(zq)
        .group(zqs)
      .x(d3.scale.linear()
        .domain([30, 110])
        .rangeRound([30, 2 * 110])),

    barChart()
        .dimension(date)
        .group(dates)
        .round(d3.time.day.round)
      .x(d3.time.scale()
        .domain(dateRange)
        .range([0, 4 * dateDifference(dateRange[0], dateRange[1])]))
  ];

  // Given our array of charts, which we assume are in the same order as the
  // .chart elements in the DOM, bind the charts to the DOM and render them.
  // We also listen to the chart's brush events to update the display.
  var chart = d3.selectAll(".chart")
      .data(charts)
      .each(function(chart) { chart.on("brush", renderAll).on("brushend", renderAll); });

  // Render the initial lists.
  var list = d3.selectAll(".list")
      .data([nightList]);

  // Render the total.
  d3.selectAll("#total")
      .text(formatNumber(night.size()));

  renderAll();

  // Renders the specified chart or list.
  function render(method) {
    d3.select(this).call(method);
  }

  // Whenever the brush moves, re-rendering everything.
  function renderAll() {
    chart.each(render);
    list.each(render);
    d3.select("#active").text(formatNumber(all.value()));
  }

  window.filter = function(filters) {
    filters.forEach(function(d, i) { charts[i].filter(d); });
    renderAll();
  };

  window.reset = function(i) {
    charts[i].filter(null);
    renderAll();
  };

  // The table at the bottom of the page
  function nightList(div) {
    var dateList = date.top(50);

    div.each(function() {
      var date = d3.select(this).selectAll(".night")
        .data(dateList).order();

      var dateEnter = date.enter().append("div")
          .attr("class", "night");

      dateEnter.append("div")
          .attr("class", "nightDate")
          .text(function(d) { return formatDate(d.date); });

      dateEnter.append("div")
          .attr("class", "pillow")
          .text(function(d) { return formatTime(d.pillow); });

      dateEnter.append("div")
          .attr("class", "wake")
          .text(function(d) { return formatTime(d.wake); });

      dateEnter.append("div")
          .attr("class", "hours")
          .classed("good", function(d) { return d.hours >= 7.5; })
          .text(function(d) { return formatFloat(d.hours) + " hours"; });

      date.exit().remove();
    });
  }

  function barChart() {
    if (!barChart.id) barChart.id = 0;

    var margin = {top: 10, right: 10, bottom: 20, left: 10},
        x,
        y = d3.scale.linear().range([100, 0]),
        id = barChart.id++,
        axis = d3.svg.axis().orient("bottom"),
        brush = d3.svg.brush(),
        brushDirty,
        dimension,
        group,
        round;

    function chart(div) {
      var width = x.range()[1],
          height = y.range()[0];

      y.domain([0, group.top(1)[0].value]);

      div.each(function() {
        var div = d3.select(this),
            g = div.select("g");

        // Create the skeletal chart.
        if (g.empty()) {
          div.select(".title").append("a")
              .attr("href", "javascript:reset(" + id + ")")
              .attr("class", "reset")
              .text("reset")
              .style("display", "none");

          g = div.append("svg")
              .attr("width", width + margin.left + margin.right)
              .attr("height", height + margin.top + margin.bottom)
            .append("g")
              .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

          g.append("clipPath")
              .attr("id", "clip-" + id)
            .append("rect")
              .attr("width", width)
              .attr("height", height);

          g.selectAll(".bar")
              .data(["background", "foreground"])
            .enter().append("path")
              .attr("class", function(d) { return d + " bar"; })
              .datum(group.all());

          g.selectAll(".foreground.bar")
              .attr("clip-path", "url(#clip-" + id + ")");

          g.append("g")
              .attr("class", "axis")
              .attr("transform", "translate(0," + height + ")")
              .call(axis);

          // Initialize the brush component with pretty resize handles.
          var gBrush = g.append("g").attr("class", "brush").call(brush);
          gBrush.selectAll("rect").attr("height", height);
          gBrush.selectAll(".resize").append("path").attr("d", resizePath);
        }

        // Only redraw the brush if set externally.
        if (brushDirty) {
          brushDirty = false;
          g.selectAll(".brush").call(brush);
          div.select(".title a").style("display", brush.empty() ? "none" : null);
          if (brush.empty()) {
            g.selectAll("#clip-" + id + " rect")
                .attr("x", 0)
                .attr("width", width);
          } else {
            var extent = brush.extent();
            g.selectAll("#clip-" + id + " rect")
                .attr("x", x(extent[0]))
                .attr("width", x(extent[1]) - x(extent[0]));
          }
        }

        g.selectAll(".bar").attr("d", barPath);
      });

      function barPath(groups) {
        var path = [],
            i = -1,
            n = groups.length,
            d;
        while (++i < n) {
          d = groups[i];
          path.push("M", x(d.key), ",", height, "V", y(d.value), "h9V", height);
        }
        return path.join("");
      }

      function resizePath(d) {
        var e = +(d == "e"),
            x = e ? 1 : -1,
            y = height / 3;
        return "M" + (.5 * x) + "," + y
            + "A6,6 0 0 " + e + " " + (6.5 * x) + "," + (y + 6)
            + "V" + (2 * y - 6)
            + "A6,6 0 0 " + e + " " + (.5 * x) + "," + (2 * y)
            + "Z"
            + "M" + (2.5 * x) + "," + (y + 8)
            + "V" + (2 * y - 8)
            + "M" + (4.5 * x) + "," + (y + 8)
            + "V" + (2 * y - 8);
      }
    }

    brush.on("brushstart.chart", function() {
      var div = d3.select(this.parentNode.parentNode.parentNode);
      div.select(".title a").style("display", null);
    });

    brush.on("brush.chart", function() {
      var g = d3.select(this.parentNode),
          extent = brush.extent();
      if (round) g.select(".brush")
          .call(brush.extent(extent = extent.map(round)))
        .selectAll(".resize")
          .style("display", null);
      g.select("#clip-" + id + " rect")
          .attr("x", x(extent[0]))
          .attr("width", x(extent[1]) - x(extent[0]));
      dimension.filterRange(extent);
    });

    brush.on("brushend.chart", function() {
      if (brush.empty()) {
        var div = d3.select(this.parentNode.parentNode.parentNode);
        div.select(".title a").style("display", "none");
        div.select("#clip-" + id + " rect").attr("x", null).attr("width", "100%");
        dimension.filterAll();
      }
    });

    chart.margin = function(_) {
      if (!arguments.length) return margin;
      margin = _;
      return chart;
    };

    chart.x = function(_) {
      if (!arguments.length) return x;
      x = _;
      axis.scale(x);
      brush.x(x);
      return chart;
    };

    chart.y = function(_) {
      if (!arguments.length) return y;
      y = _;
      return chart;
    };

    chart.dimension = function(_) {
      if (!arguments.length) return dimension;
      dimension = _;
      return chart;
    };

    chart.filter = function(_) {
      if (_) {
        brush.extent(_);
        dimension.filterRange(_);
      } else {
        brush.clear();
        dimension.filterAll();
      }
      brushDirty = true;
      return chart;
    };

    chart.group = function(_) {
      if (!arguments.length) return group;
      group = _;
      return chart;
    };

    chart.round = function(_) {
      if (!arguments.length) return round;
      round = _;
      return chart;
    };

    return d3.rebind(chart, brush, "on");
  }
});
