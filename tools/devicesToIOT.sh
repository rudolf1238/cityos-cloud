#!/bin/sh

PROJECT_KEY=PKS2MKXK0K2SRRYEZK
PROJECT_KEY_2=PKTBXG4BA1WC04T1KZ
MID=noodoe

k=121.564645
incl=0.0004

for i in {1..10}; do 
curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "智慧路燈-忠孝東路S$i",
  "desc": "智慧路燈-忠孝東路S$i",
  "id": "$i",
  "manufacturerId": "$MID",
  "lon": $k,
  "lat": 25.041060,
  "attributes": [
    {
      "key": "device_type",
      "value": "streetlight"
    }
  ],
  "data": [
    {
      "sensor": "brightnessPercent",
      "value": 35,
      "unit": "%"
    },
    {
      "sensor": "setBrightnessPercent",
      "value": 35,
      "unit": "%"
    },
    {
      "sensor": "powerCon",
      "value": 10,
      "unit": "W"
    },
    {
      "sensor": "voltage",
      "value": 12,
      "unit": "V"
    },
    {
      "sensor": "current",
      "value": 100,
      "unit": "mA"
    },
    {
      "sensor": "temp",
      "value": 30,
      "unit": "℃"
    }
  ]
}
EOF
  k=`echo $k + $incl | bc`
done

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "智慧路燈-南港路S1",
  "desc": "智慧路燈-南港路S1",
  "id": "11",
  "manufacturerId": "$MID",
  "lon": 121.606465,
  "lat": 25.053196,
  "attributes": [
    {
      "key": "device_type",
      "value": "streetlight"
    }
  ],
  "data": [
    {
      "sensor": "brightnessPercent",
      "value": 35,
      "unit": "%"
    },
    {
      "sensor": "setBrightnessPercent",
      "value": 35,
      "unit": "%"
    },
    {
      "sensor": "powerCon",
      "value": 10,
      "unit": "W"
    },
    {
      "sensor": "voltage",
      "value": 12,
      "unit": "V"
    },
    {
      "sensor": "current",
      "value": 100,
      "unit": "mA"
    },
    {
      "sensor": "temp",
      "value": 30,
      "unit": "℃"
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "太陽能附掛於南港路S1",
  "desc": "太陽能附掛於南港路S1",
  "id": "12",
  "manufacturerId": "$MID",
  "lon": 121.606465,
  "lat": 25.053196,
  "attributes": [
    {
      "key": "device_type",
      "value": "solar"
    }, {
      "key": "attach_on",
      "value": "$MID:11"
    }
  ],
  "data": [
    {
      "sensor": "BAT_voltage",
      "value": 22,
      "unit": "V"
    },
    {
      "sensor": "BAT_current",
      "value": 5,
      "unit": "A"
    },
    {
      "sensor": "BAT_capacity",
      "value": 10,
      "unit": "W"
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "充電樁附掛於南港路S1",
  "desc": "充電樁附掛於南港路S1",
  "id": "13",
  "manufacturerId": "$MID",
  "lon": 121.606465,
  "lat": 25.053196,
  "attributes": [
    {
      "key": "device_type",
      "value": "charging_pile"
    }, {
      "key": "attach_on",
      "value": "$MID:11"
    }
  ],
  "data": [
    {
      "sensor": "30daysMeter",
      "value": 2.11,
      "unit": "kwH"
    },
    {
      "sensor": "30daysCount",
      "value": 1,
      "unit": ""
    },
    {
      "sensor": "status",
      "value": "available"
    },
    {
      "sensor": "amount",
      "value": 100
    },
    {
      "sensor": "meter",
      "value": 10
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "攝影機附掛於南港路S1",
  "desc": "攝影機附掛於南港路S1",
  "id": "14",
  "manufacturerId": "$MID",
  "lon": 121.606465,
  "lat": 25.053196,
  "attributes": [
    {
      "key": "device_type",
      "value": "cctv"
    }, {
      "key": "attach_on",
      "value": "$MID:11"
    }, {
      "key": "camid",
      "value": "76940647d1"
    }
  ],
  "data": [
    {
      "sensor": "gender",
      "value": "f"
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "水位計附掛於南港路S1",
  "desc": "水位計附掛於南港路S1",
  "id": "15",
  "manufacturerId": "$MID",
  "lon": 121.606465,
  "lat": 25.053196,
  "attributes": [
    {
      "key": "device_type",
      "value": "waterlevel"
    }, {
      "key": "attach_on",
      "value": "$MID:11"
    }
  ],
  "data": [
    {
      "sensor": "level",
      "value": 0.1,
      "unit": "m"
    }, {
      "sensor": "volt",
      "value": 10,
      "unit": "%"
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "氣象站附掛於南港路S1",
  "desc": "氣象站附掛於南港路S1",
  "id": "16",
  "manufacturerId": "$MID",
  "lon": 121.606465,
  "lat": 25.053196,
  "attributes": [
    {
      "key": "device_type",
      "value": "meter"
    }, {
      "key": "attach_on",
      "value": "$MID:11"
    }
  ],
  "data": [
    {
      "sensor": "pm2_5",
      "value": 3,
      "unit": "ug/m3"
    }, {
      "sensor": "pm10",
      "value": 4,
      "unit": "ug/m3"
    }, {
      "sensor": "no2",
      "value": 78.43,
      "unit": "ppm"
    }, {
      "sensor": "co",
      "value": 0,
      "unit": "ppn"
    }, {
      "sensor": "o3",
      "value": 96.38,
      "unit": "ppm"
    }, {
      "sensor": "temperature",
      "value": 35.24,
      "unit": "℃"
    }, {
      "sensor": "humidity",
      "value": 62.51,
      "unit": "%"
    }, {
      "sensor": "ray_radiation",
      "value": 6350,
      "unit": "W/m2"
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "Wifi熱點附掛於南港路S1",
  "desc": "Wifi熱點附掛於南港路S1",
  "id": "17",
  "manufacturerId": "$MID",
  "lon": 121.606465,
  "lat": 25.053196,
  "attributes": [
    {
      "key": "device_type",
      "value": "wifi_ap"
    }, {
      "key": "attach_on",
      "value": "$MID:11"
    }
  ],
  "data": [
    {
      "sensor": "connUserCount",
      "value": 5,
      "unit": "人"
    }, {
      "sensor": "uploadSpeed",
      "value": 2,
      "unit": "mbps"
    }, {
      "sensor": "downloadSpeed",
      "value": 21,
      "unit": "mbps"
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "電子看板附掛於南港路S1",
  "desc": "電子看板附掛於南港路S1",
  "id": "18",
  "manufacturerId": "$MID",
  "lon": 121.606465,
  "lat": 25.053196,
  "attributes": [
    {
      "key": "device_type",
      "value": "digital_signage"
    }, {
      "key": "attach_on",
      "value": "$MID:11"
    }
  ],
  "data": [
    {
      "sensor": "player_os_cpu_usage",
      "value": 80,
      "unit": "%"
    }, {
      "sensor": "player_os_memory_usage",
      "value": 75,
      "unit": "%"
    }, {
      "sensor": "player_os_temperature",
      "value": 35,
      "unit": "℃"
    }, {
      "sensor": "player_address",
      "value": "台北市南港區"
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "智慧路燈-南港路S2-缺少燈控",
  "desc": "智慧路燈-南港路S2-缺少燈控",
  "id": "19",
  "manufacturerId": "$MID",
  "lon": 121.614054,
  "lat": 25.057994,
  "attributes": [
    {
      "key": "device_type",
      "value": "streetlight"
    }
  ],
  "data": [
    {
      "sensor": "temp",
      "value": 30,
      "unit": "℃"
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "緊急設備附掛於南港路S2",
  "desc": "緊急設備附掛於南港路S2",
  "id": "20",
  "manufacturerId": "$MID",
  "lon": 121.614054,
  "lat": 25.057994,
  "attributes": [
    {
      "key": "device_type",
      "value": "emergency"
    },
    {
      "key": "attach_on",
      "value": "$MID:19"
    }
  ],
  "data": [
    {
      "sensor": "temp",
      "value": 30,
      "unit": "℃"
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "人型攝影機附掛於南港路S2",
  "desc": "人型攝影機附掛於南港路S2",
  "id": "21",
  "manufacturerId": "$MID",
  "lon": 121.614054,
  "lat": 25.057994,
  "attributes": [
    {
      "key": "device_type",
      "value": "cctv"
    },
    {
      "key": "recognition_type",
      "value": "human_shape"
    },
    {
      "key": "attach_on",
      "value": "$MID:19"
    },
    {
      "key": "camid",
      "value": "76940647d1"
    }
  ],
  "data": [
    {
      "sensor": "gender",
      "value": "f"
    },
    {
      "sensor": "clothesColor",
      "value": "red"
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "車牌攝影機附掛於南港路S2",
  "desc": "車牌攝影機附掛於南港路S2",
  "id": "22",
  "manufacturerId": "$MID",
  "lon": 121.614054,
  "lat": 25.057994,
  "attributes": [
    {
      "key": "device_type",
      "value": "cctv"
    },
    {
      "key": "recognition_type",
      "value": "car_identify"
    },
    {
      "key": "attach_on",
      "value": "$MID:19"
    },
    {
      "key": "camid",
      "value": "76940647d1"
    }
  ],
  "data": [
    {
      "sensor": "numberPlate",
      "value": "AZ-1234"
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "智慧路燈-南港路S3",
  "desc": "智慧路燈-南港路S3",
  "id": "23",
  "manufacturerId": "$MID",
  "lon": 121.6168887,
  "lat": 25.0549955,
  "attributes": [
    {
      "key": "device_type",
      "value": "streetlight"
    }
  ],
  "data": [
    {
      "sensor": "brightnessPercent",
      "value": 35,
      "unit": "%"
    },
    {
      "sensor": "setBrightnessPercent",
      "value": 35,
      "unit": "%"
    },
    {
      "sensor": "powerCon",
      "value": 10,
      "unit": "W"
    },
    {
      "sensor": "voltage",
      "value": 12,
      "unit": "V"
    },
    {
      "sensor": "current",
      "value": 100,
      "unit": "mA"
    },
    {
      "sensor": "temp",
      "value": 30,
      "unit": "℃"
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "智慧路燈-南港路S4",
  "desc": "智慧路燈-南港路S4",
  "id": "24",
  "manufacturerId": "$MID",
  "lon": 121.6177634,
  "lat": 25.0548398,
  "attributes": [
    {
      "key": "device_type",
      "value": "streetlight"
    }
  ],
  "data": [
    {
      "sensor": "brightnessPercent",
      "value": 35,
      "unit": "%"
    },
    {
      "sensor": "setBrightnessPercent",
      "value": 35,
      "unit": "%"
    },
    {
      "sensor": "powerCon",
      "value": 10,
      "unit": "W"
    },
    {
      "sensor": "voltage",
      "value": 12,
      "unit": "V"
    },
    {
      "sensor": "current",
      "value": 100,
      "unit": "mA"
    },
    {
      "sensor": "temp",
      "value": 30,
      "unit": "℃"
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "氣象站附掛於南港路S3",
  "desc": "氣象站附掛於南港路S3",
  "id": "25",
  "manufacturerId": "$MID",
  "lon": 121.6168887,
  "lat": 25.0549955,
  "attributes": [
    {
      "key": "device_type",
      "value": "meter"
    }, {
      "key": "attach_on",
      "value": "$MID:23"
    }
  ],
  "data": [
    {
      "sensor": "pm2_5",
      "value": 3,
      "unit": "ug/m3"
    }, {
      "sensor": "pm10",
      "value": 4,
      "unit": "ug/m3"
    }, {
      "sensor": "no2",
      "value": 78.43,
      "unit": "ppm"
    }, {
      "sensor": "co",
      "value": 0,
      "unit": "ppn"
    }, {
      "sensor": "o3",
      "value": 96.38,
      "unit": "ppm"
    }, {
      "sensor": "temperature",
      "value": 35.24,
      "unit": "℃"
    }, {
      "sensor": "humidity",
      "value": 62.51,
      "unit": "%"
    }, {
      "sensor": "ray_radiation",
      "value": 6350,
      "unit": "W/m2"
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "氣象站附掛於南港路S4",
  "desc": "氣象站附掛於南港路S4",
  "id": "26",
  "manufacturerId": "$MID",
  "lon": 121.6177634,
  "lat": 25.0548398,
  "attributes": [
    {
      "key": "device_type",
      "value": "meter"
    }, {
      "key": "attach_on",
      "value": "$MID:24"
    }
  ],
  "data": [
    {
      "sensor": "pm2_5",
      "value": 3,
      "unit": "ug/m3"
    }, {
      "sensor": "pm10",
      "value": 4,
      "unit": "ug/m3"
    }, {
      "sensor": "no2",
      "value": 78.43,
      "unit": "ppm"
    }, {
      "sensor": "co",
      "value": 0,
      "unit": "ppn"
    }, {
      "sensor": "o3",
      "value": 96.38,
      "unit": "ppm"
    }, {
      "sensor": "temperature",
      "value": 35.24,
      "unit": "℃"
    }, {
      "sensor": "humidity",
      "value": 62.51,
      "unit": "%"
    }, {
      "sensor": "ray_radiation",
      "value": 6350,
      "unit": "W/m2"
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "人流攝影機附掛於南港路S2",
  "desc": "人流攝影機附掛於南港路S2",
  "id": "27",
  "manufacturerId": "$MID",
  "lon": 121.614054,
  "lat": 25.057994,
  "attributes": [
    {
      "key": "device_type",
      "value": "cctv"
    },
    {
      "key": "recognition_type",
      "value": "human_flow"
    },
    {
      "key": "attach_on",
      "value": "$MID:19"
    },
    {
      "key": "camid",
      "value": "76940647d1"
    }
  ],
  "data": [
    {
      "sensor": "human_count",
      "value": 10
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "車流攝影機附掛於南港路S2",
  "desc": "車流攝影機附掛於南港路S2",
  "id": "28",
  "manufacturerId": "$MID",
  "lon": 121.614054,
  "lat": 25.057994,
  "attributes": [
    {
      "key": "device_type",
      "value": "cctv"
    },
    {
      "key": "recognition_type",
      "value": "car_flow"
    },
    {
      "key": "attach_on",
      "value": "$MID:19"
    },
    {
      "key": "camid",
      "value": "76940647d1"
    }
  ],
  "data": [
    {
      "sensor": "car_flow_straight_count",
      "value": 32
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "人流年齡攝影機附掛於南港路S1",
  "desc": "人流年齡攝影機附掛於南港路S1",
  "id": "29",
  "manufacturerId": "$MID",
  "lon": 121.606465,
  "lat": 25.053196,
  "attributes": [
    {
      "key": "device_type",
      "value": "cctv"
    }, {
      "key": "attach_on",
      "value": "$MID:11"
    }, {
      "key": "camid",
      "value": "76940647d1"
    }, {
      "key": "recognition_type",
      "value": "human_flow_advance"
    }
  ],
  "data": [
    {
      "sensor": "human_flow_sex",
      "value": "f"
    }, {
      "sensor": "human_flow_age",
      "value": 2
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "車流攝影機-南港路A1",
  "desc": "車流攝影機-南港路A1",
  "id": "30",
  "manufacturerId": "$MID",
  "lon": 121.5932824,
  "lat": 25.0503393,
  "attributes": [
    {
      "key": "device_type",
      "value": "cctv"
    },
    {
      "key": "recognition_type",
      "value": "car_flow"
    },
    {
      "key": "camid",
      "value": "76940647d1"
    }
  ],
  "data": [
    {
      "sensor": "car_flow_straight_count",
      "value": 32
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "車流攝影機-南港路A2",
  "desc": "車流攝影機-南港路A2",
  "id": "31",
  "manufacturerId": "$MID",
  "lon": 121.5976931,
  "lat": 25.0518848,
  "attributes": [
    {
      "key": "device_type",
      "value": "cctv"
    },
    {
      "key": "recognition_type",
      "value": "car_flow"
    },
    {
      "key": "camid",
      "value": "76940647d1"
    }
  ],
  "data": [
    {
      "sensor": "car_flow_straight_count",
      "value": 32
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "車流攝影機-南港路A3",
  "desc": "車流攝影機-南港路A3",
  "id": "32",
  "manufacturerId": "$MID",
  "lon": 121.6033655,
  "lat": 25.0527025,
  "attributes": [
    {
      "key": "device_type",
      "value": "cctv"
    },
    {
      "key": "recognition_type",
      "value": "car_flow"
    },
    {
      "key": "camid",
      "value": "76940647d1"
    }
  ],
  "data": [
    {
      "sensor": "car_flow_straight_count",
      "value": 32
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "人流攝影機-南港路A1",
  "desc": "人流攝影機-南港路A1",
  "id": "33",
  "manufacturerId": "$MID",
  "lon": 121.5932533,
  "lat": 25.0503945,
  "attributes": [
    {
      "key": "device_type",
      "value": "cctv"
    },
    {
      "key": "recognition_type",
      "value": "human_flow"
    },
    {
      "key": "camid",
      "value": "76940647d1"
    }
  ],
  "data": [
    {
      "sensor": "human_count",
      "value": 24
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "人流攝影機-南港路A2",
  "desc": "人流攝影機-南港路A2",
  "id": "34",
  "manufacturerId": "$MID",
  "lon": 121.5975967,
  "lat": 25.0518281,
  "attributes": [
    {
      "key": "device_type",
      "value": "cctv"
    },
    {
      "key": "recognition_type",
      "value": "human_flow"
    },
    {
      "key": "camid",
      "value": "76940647d1"
    }
  ],
  "data": [
    {
      "sensor": "human_count",
      "value": 24
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "人流攝影機-南港路A3",
  "desc": "人流攝影機-南港路A3",
  "id": "35",
  "manufacturerId": "$MID",
  "lon": 121.6032982,
  "lat": 25.052611,
  "attributes": [
    {
      "key": "device_type",
      "value": "cctv"
    },
    {
      "key": "recognition_type",
      "value": "human_flow"
    },
    {
      "key": "camid",
      "value": "76940647d1"
    }
  ],
  "data": [
    {
      "sensor": "human_count",
      "value": 24
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "充電樁-南港路A1",
  "desc": "充電樁-南港路A1",
  "id": "36",
  "manufacturerId": "$MID",
  "lon": 121.6153246,
  "lat": 25.0581997,
  "attributes": [
    {
      "key": "device_type",
      "value": "charging_pile"
    }
  ],
  "data": [
    {
      "sensor": "30daysMeter",
      "value": 2.11,
      "unit": "kwH"
    },
    {
      "sensor": "30daysCount",
      "value": 1,
      "unit": ""
    },
    {
      "sensor": "status",
      "value": "alarm"
    },
    {
      "sensor": "amount",
      "value": 120
    },
    {
      "sensor": "meter",
      "value": 15
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "充電樁-南港路A2",
  "desc": "充電樁-南港路A2",
  "id": "37",
  "manufacturerId": "$MID",
  "lon": 121.6153246,
  "lat": 25.0581997,
  "attributes": [
    {
      "key": "device_type",
      "value": "charging_pile"
    }
  ],
  "data": [
    {
      "sensor": "30daysMeter",
      "value": 2.11,
      "unit": "kwH"
    },
    {
      "sensor": "30daysCount",
      "value": 1,
      "unit": ""
    },
    {
      "sensor": "status",
      "value": "alarm"
    },
    {
      "sensor": "amount",
      "value": 120
    },
    {
      "sensor": "meter",
      "value": 15
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "充電樁-南港路A3",
  "desc": "充電樁-南港路A3",
  "id": "38",
  "manufacturerId": "$MID",
  "lon": 121.6153246,
  "lat": 25.0581997,
  "attributes": [
    {
      "key": "device_type",
      "value": "charging_pile"
    }
  ],
  "data": [
    {
      "sensor": "30daysMeter",
      "value": 2.11,
      "unit": "kwH"
    },
    {
      "sensor": "30daysCount",
      "value": 1,
      "unit": ""
    },
    {
      "sensor": "status",
      "value": "alarm"
    },
    {
      "sensor": "amount",
      "value": 120
    },
    {
      "sensor": "meter",
      "value": 15
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "充電樁-南港路A4",
  "desc": "充電樁-南港路A4",
  "id": "39",
  "manufacturerId": "$MID",
  "lon": 121.6153246,
  "lat": 25.0581997,
  "attributes": [
    {
      "key": "device_type",
      "value": "charging_pile"
    }
  ],
  "data": [
    {
      "sensor": "30daysMeter",
      "value": 2.11,
      "unit": "kwH"
    },
    {
      "sensor": "30daysCount",
      "value": 1,
      "unit": ""
    },
    {
      "sensor": "status",
      "value": "alarm"
    },
    {
      "sensor": "amount",
      "value": 120
    },
    {
      "sensor": "meter",
      "value": 15
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY_2" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "新北市政府於Siam的路燈",
  "desc": "新北市政府於Siam的路燈",
  "id": "1001",
  "manufacturerId": "$MID",
  "lon": 100.5341901,
  "lat": 13.745786,
  "attributes": [
    {
      "key": "device_type",
      "value": "streetlight"
    }
  ],
  "data": [
    {
      "sensor": "temp",
      "value": 30,
      "unit": "℃"
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY_2" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "板橋車站之車牌辨識路燈",
  "desc": "板橋車站之車牌辨識路燈",
  "id": "1002",
  "manufacturerId": "$MID",
  "lon": 121.4629154,
  "lat": 25.0136648,
  "attributes": [
    {
      "key": "device_type",
      "value": "streetlight"
    }
  ],
  "data": [
    {
      "sensor": "temp",
      "value": 30,
      "unit": "℃"
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY_2" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "板橋車站之人形辨識路燈",
  "desc": "板橋車站之人形辨識路燈",
  "id": "1003",
  "manufacturerId": "$MID",
  "lon": 121.4625801,
  "lat": 25.0133285,
  "attributes": [
    {
      "key": "device_type",
      "value": "streetlight"
    }
  ],
  "data": [
    {
      "sensor": "temp",
      "value": 30,
      "unit": "℃"
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY_2" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "板橋車站車牌辨識CCTV",
  "desc": "板橋車站車牌辨識CCTV",
  "id": "1004",
  "manufacturerId": "$MID",
  "lon": 121.4629154,
  "lat": 25.0136648,
  "attributes": [
    {
      "key": "device_type",
      "value": "cctv"
    },
    {
      "key": "recognition_type",
      "value": "car_identify"
    },
    {
      "key": "attach_on",
      "value": "$MID:1002"
    }
  ],
  "data": [
    {
      "sensor": "numberPlate",
      "value": "AZ-1234"
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY_2" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "板橋車站人形辨識CCTV",
  "desc": "板橋車站人形辨識CCTV",
  "id": "1005",
  "manufacturerId": "$MID",
  "lon": 121.4625801,
  "lat": 25.0133285,
  "attributes": [
    {
      "key": "device_type",
      "value": "cctv"
    },
    {
      "key": "recognition_type",
      "value": "human_shape"
    },
    {
      "key": "attach_on",
      "value": "$MID:1003"
    }
  ],
  "data": [
    {
      "sensor": "gender",
      "value": "f"
    },
    {
      "sensor": "clothesColor",
      "value": "red"
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY_2" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "板橋車站人流攝影機",
  "desc": "板橋車站人流攝影機",
  "id": "1006",
  "manufacturerId": "$MID",
  "lon": 121.4625801,
  "lat": 25.0133285,
  "attributes": [
    {
      "key": "device_type",
      "value": "cctv"
    },
    {
      "key": "recognition_type",
      "value": "human_flow"
    }
  ],
  "data": [
    {
      "sensor": "human_count",
      "value": 10
    }
  ]
}
EOF

curl -X POST -H "Content-Type: application/json" -H "CK: $PROJECT_KEY_2" "https://iot.cht.com.tw/adaptor/api/v1/rawdata" --data-binary @- << EOF
{
  "name": "板橋車站車流攝影機",
  "desc": "板橋車站車流攝影機",
  "id": "1007",
  "manufacturerId": "$MID",
  "lon": 121.4625801,
  "lat": 25.0133285,
  "attributes": [
    {
      "key": "device_type",
      "value": "cctv"
    },
    {
      "key": "recognition_type",
      "value": "car_flow"
    }
  ],
  "data": [
    {
      "sensor": "car_flow_straight_count",
      "value": 6
    }
  ]
}
EOF