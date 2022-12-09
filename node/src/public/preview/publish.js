window.onload = function () {
  alert('publish1');

  function getTemperatureUnit(temp, temperatureUnit) {
    const celsius = temp - 273.15;
    const fahrenheit = celsius * (9 / 5) + 32;
    if (temperatureUnit === 'C') return parseFloat(celsius.toPrecision(12));

    return parseFloat(fahrenheit.toPrecision(12));
  }
  function getFilterDateWithCondition(list, field, condition) {
    let results = [];
    for (var i = 0; i < list.length; i++) {
      const data = list[i];
      var isExited = data[field].indexOf(condition) !== -1;
      if (isExited) {
        results.push(data);
      }
    }
    return results;
  }

  function renderWeekList(data, outerIndex, innerIndex) {
    var tempMaxRef = document.getElementById(
      'tempMax' + outerIndex + innerIndex,
    );
    var tempMinRef = document.getElementById(
      'tempMin' + outerIndex + innerIndex,
    );
    var dateRef = document.getElementById('date' + outerIndex + innerIndex);
    var iconRef = document.getElementById(
      'weatherIcon' + outerIndex + innerIndex,
    );
    var date = data.dt_txt;
    var weatherIcon = data.weather[0].icon;
    var iconUrl =
      'https://openweathermap.org/img/wn/' + weatherIcon + '@2x.png';
    var splitDate = date.split(' ')[0];
    var temp_max = getTemperatureUnit(data.main.temp_max, 'C');
    var temp_min = getTemperatureUnit(data.main.temp_min, 'C');

    // data week data
    tempMaxRef.innerHTML = temp_max;
    tempMinRef.innerHTML = temp_min;
    dateRef.innerHTML = splitDate;
    iconRef.src = iconUrl;
  }
  function modulaA(weatherData, index) {
    var backgroundColor = document.getElementById('backgroundColor').innerText;
    for (let child of document.querySelectorAll('.weatherA__container')) {
      child.style.backgroundColor = '#' + backgroundColor;
    }
    var cityRef = document.getElementById(`national${index}`);
    var temperatureRef = document.getElementById(`temperature${index}`);
    var weatherIconRef = document.getElementById(`weatherIcon${index}`);
    var weatherStatusRef = document.getElementById(`weatherStatus${index}`);
    var tempUnit = 'C';
    var weather = weatherData.weather[0];
    var temperatureData = weatherData.main;
    var weatherStatus = weather.main;
    var iconNo = weather.icon;
    var iconUrl = 'http://openweathermap.org/img/wn/' + iconNo + '@2x.png';
    var city = weatherData.name;
    var country = weatherData.sys.country;
    var temp = getTemperatureUnit(temperatureData.temp, tempUnit);
    cityRef.innerHTML = city + ', ' + country;
    temperatureRef.innerHTML = temp;
    weatherIconRef.src = iconUrl;
    weatherStatusRef.innerHTML = weatherStatus;
  }
  function modulaB(weatherData, index) {
    var backgroundColor = document.getElementById('backgroundColor').innerText;
    for (let child of document.querySelectorAll('.weatherB_container')) {
      child.style.backgroundColor = '#' + backgroundColor;
    }
    var nationalRef = document.getElementById(`national${index}`);
    var temperatureRef = document.getElementById(`temperatureB${index}`);
    var weatherIconRef = document.getElementById(`weatherIconB${index}`);
    var weatherStatusRef = document.getElementById(`weatherStatusB${index}`);
    var riseTimeRef = document.getElementById(`riseTime${index}`);
    var tempMaxRef = document.getElementById(`tempMax${index}`);
    var tempMinRef = document.getElementById(`tempMin${index}`);
    var setTimeRef = document.getElementById(`setTime${index}`);
    var windRef = document.getElementById(`wind${index}`);
    var tempUnit = 'C';
    var weather = weatherData.weather[0];
    var temperatureData = weatherData.main;
    var weatherStatus = weather.main;
    var iconNo = weather.icon;
    var iconUrl = 'http://openweathermap.org/img/wn/' + iconNo + '@2x.png';
    var city = weatherData.name;
    var country = weatherData.sys.country;
    var temp = getTemperatureUnit(temperatureData.temp, tempUnit);
    var tempMax = getTemperatureUnit(temperatureData.temp_max, tempUnit);
    var tempMin = getTemperatureUnit(temperatureData.temp_min, tempUnit);
    var time = {
      rise:
        new Date(weatherData.sys.sunrise * 1000).getHours() +
        ': ' +
        new Date(weatherData.sys.sunrise * 1000).getMinutes(),
      set:
        new Date(weatherData.sys.sunset * 1000).getHours() +
        ': ' +
        new Date(weatherData.sys.sunrise * 1000).getMinutes(),
    };
    var wind = weatherData.wind.speed;
    nationalRef.innerHTML = city + ', ' + country;
    temperatureRef.innerHTML = temp;
    weatherIconRef.src = iconUrl;
    riseTimeRef.innerHTML = time.rise;
    setTimeRef.innerHTML = time.set;
    tempMaxRef.innerHTML = tempMax;
    tempMinRef.innerHTML = tempMin;
    windRef.innerHTML = wind;
  }
  function modulaC(weatherData, outerIndex) {
    var backgroundColor = document.getElementById('backgroundColor').innerText;
    for (let child of document.querySelectorAll('.weather_containerC')) {
      child.style.backgroundColor = '#' + backgroundColor;
    }
    var list = weatherData.list;
    var nationalRef = document.getElementById('national' + outerIndex);
    var city = weatherData.city;
    nationalRef.innerHTML = city.name + ', ' + city.country;
    var filteredDateList = getFilterDateWithCondition(
      list,
      'dt_txt',
      '21:00:00',
    );
    var listLen = filteredDateList.length;
    for (var d = 0; d < listLen; d++) {
      // if (d !== 0) break;
      renderWeekList(filteredDateList[d], outerIndex, d);
    }
  }

  function apiCall(city, weatherType, index) {
    var url =
      'https://api.openweathermap.org/data/2.5/weather?q=' +
      city +
      '&appid=9206a68a8959e10e39f8cb49a708e310';

    alert(weatherType);
    if (weatherType === '3') {
      url =
        'https://api.openweathermap.org/data/2.5/forecast?q=' +
        city +
        '&appid=9206a68a8959e10e39f8cb49a708e310';
    }
    var xhr = new XMLHttpRequest();
    xhr.responseType = 'json';
    xhr.open('get', url);
    xhr.send(null);
    xhr.onload = function () {
      var weatherData = xhr.response;
      if (weatherType === '1') modulaA(weatherData, index);
      if (weatherType === '2') modulaB(weatherData, index);
      if (weatherType === '3') modulaC(weatherData, index);
    };
  }
  function layout() {
    var cityList = document.getElementById('cityList').innerText;
    var weatherType = document.getElementById('weatherType').innerText;
    var templateType = document.getElementById('templateType').innerText;
    // var cityList = 'taipei';
    // var weatherType = '3';
    var formattedCityList = cityList.split(',');
    formattedCityList.forEach(function (city, index) {
      apiCall(city, weatherType, index);
    });
  }

  layout();

  // let weatherStep = 0;
  // const weatherList = document.getElementById('weather');
  // console.log(weatherList, 'weatherList');
  // const weatherChildren = weatherList.childNodes;
  // const weatherChildrenLen = weatherChildren.length;
  // setInterval(() => {
  //   weatherChildren.forEach((child) => {
  //     child.style.opacity = 0;
  //   });
  //   weatherChildren[weatherStep].style.opacity = 1;
  //   weatherStep = weatherStep === weatherChildrenLen - 1 ? 0 : weatherStep + 1;
  // }, 2000);
};
