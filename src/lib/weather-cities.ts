type WeatherCity = { label: string; lat: number; lon: number };

export const defaultWeatherCity = 'suwon';

export const weatherRegions: { label: string; cities: Record<string, WeatherCity> }[] = [
  { label: '서울·인천·경기', cities: {
    suwon: { label: '수원', lat: 37.2636, lon: 127.0286 },
    seoul: { label: '서울', lat: 37.5665, lon: 126.978 },
    incheon: { label: '인천', lat: 37.4563, lon: 126.7052 },
    yongin: { label: '용인', lat: 37.241, lon: 127.178 },
    seongnam: { label: '성남', lat: 37.420, lon: 127.127 },
    hwaseong: { label: '화성', lat: 37.199, lon: 126.831 },
    anyang: { label: '안양', lat: 37.394, lon: 126.957 },
    goyang: { label: '고양', lat: 37.659, lon: 126.832 },
    bucheon: { label: '부천', lat: 37.503, lon: 126.766 },
    ansan: { label: '안산', lat: 37.322, lon: 126.831 },
    pyeongtaek: { label: '평택', lat: 36.992, lon: 127.112 },
    uijeongbu: { label: '의정부', lat: 37.738, lon: 127.034 },
    namyangju: { label: '남양주', lat: 37.636, lon: 127.217 },
    hanam: { label: '하남', lat: 37.540, lon: 127.215 },
    gimpo: { label: '김포', lat: 37.616, lon: 126.715 },
  } },
  { label: '강원', cities: {
    chuncheon: { label: '춘천', lat: 37.882, lon: 127.729 },
    wonju: { label: '원주', lat: 37.342, lon: 127.920 },
    gangneung: { label: '강릉', lat: 37.752, lon: 128.876 },
    sokcho: { label: '속초', lat: 38.208, lon: 128.591 },
  } },
  { label: '대전·세종·충청', cities: {
    daejeon: { label: '대전', lat: 36.3504, lon: 127.3845 },
    sejong: { label: '세종', lat: 36.480, lon: 127.289 },
    cheongju: { label: '청주', lat: 36.643, lon: 127.489 },
    cheonan: { label: '천안', lat: 36.815, lon: 127.114 },
    chungju: { label: '충주', lat: 36.991, lon: 127.926 },
  } },
  { label: '광주·전라', cities: {
    gwangju: { label: '광주', lat: 35.1595, lon: 126.8526 },
    jeonju: { label: '전주', lat: 35.825, lon: 127.148 },
    mokpo: { label: '목포', lat: 34.812, lon: 126.392 },
    yeosu: { label: '여수', lat: 34.760, lon: 127.662 },
    suncheon: { label: '순천', lat: 34.951, lon: 127.488 },
    gunsan: { label: '군산', lat: 35.967, lon: 126.737 },
  } },
  { label: '부산·대구·울산·경상', cities: {
    busan: { label: '부산', lat: 35.1796, lon: 129.0756 },
    daegu: { label: '대구', lat: 35.8714, lon: 128.6014 },
    ulsan: { label: '울산', lat: 35.539, lon: 129.311 },
    changwon: { label: '창원', lat: 35.228, lon: 128.681 },
    jinju: { label: '진주', lat: 35.180, lon: 128.108 },
    gimhae: { label: '김해', lat: 35.228, lon: 128.889 },
    pohang: { label: '포항', lat: 36.019, lon: 129.343 },
    gyeongju: { label: '경주', lat: 35.857, lon: 129.225 },
    andong: { label: '안동', lat: 36.568, lon: 128.729 },
  } },
  { label: '제주', cities: {
    jeju: { label: '제주', lat: 33.4996, lon: 126.5312 },
    seogwipo: { label: '서귀포', lat: 33.254, lon: 126.560 },
  } },
];

export const weatherCities = Object.fromEntries(
  weatherRegions.flatMap(region => Object.entries(region.cities)),
);
