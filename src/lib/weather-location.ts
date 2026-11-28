import { schoolLocationKey } from "./school-location";
import schoolIndex from "./data/school-weather-grid.json";
import type { NeisSchool } from "./school-public-data-model";
const index:Record<string,number>=schoolIndex.schools;
export function resolveSchoolWeatherLocation(school:Pick<NeisSchool,"name"|"road_address">){
 const address=school.road_address;
 if(!address)return null;
 const packed=index[schoolLocationKey(school.name,address)];
 if(!packed)return null;
 return {weather_nx:Math.floor(packed/256),weather_ny:packed%256,weather_location_address:address};
}
export function filterWeatherLocationSchools(schools:NeisSchool[],filter:string){
 const terms=filter.normalize("NFC").trim().split(/\s+/).filter(Boolean);
 return schools.filter(school=>resolveSchoolWeatherLocation(school)&&terms.every(term=>(school.region+" "+school.road_address).normalize("NFC").includes(term))).slice(0,30);
}
