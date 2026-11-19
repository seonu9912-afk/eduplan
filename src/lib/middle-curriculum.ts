/** National middle-school curriculum defaults; school-specific rows remain editable.
 * 2015: Ministry of Education Notice 2015-74, Book 1.
 * 2022: Ministry of Education Notice 2022-33, Book 1 (as subsequently amended).
 * These are subject/area labels, NOT preallocated instructional hours.
 */
export type MiddleRevision = "2015" | "2022";
export type MiddleGroupTemplate = Readonly<{name:string;subjects:readonly string[]}>;

export function middleRevisionForCohort(year:number):MiddleRevision{
  return year>=2025?"2022":"2015";
}

const standardGroups:readonly MiddleGroupTemplate[]=[
  {name:"국어",subjects:["국어"]},
  {name:"사회(역사 포함)/도덕",subjects:["사회","역사","도덕"]},
  {name:"수학",subjects:["수학"]},
  {name:"과학/기술·가정/정보",subjects:["과학","기술·가정","정보"]},
  {name:"체육",subjects:["체육"]},
  {name:"예술(음악/미술)",subjects:["음악","미술"]},
  {name:"영어",subjects:["영어"]},
];

const languages=["독일어","프랑스어","스페인어","중국어","일본어","러시아어","아랍어","베트남어"];
export function middleCurriculumCatalog(revision:MiddleRevision):{
  groups:readonly MiddleGroupTemplate[];
  creative:MiddleGroupTemplate;
} {
  return {
    groups:[
      ...standardGroups,
      {name:"선택",subjects:[
        "한문","환경",
        ...languages.map(language=>revision==="2022"?"생활 "+language:language),
        "보건","진로와 직업",
      ]},
    ],
    creative:{
      name:"창의적 체험활동",
      subjects:revision==="2022"
        ?["자율·자치 활동","동아리 활동","진로 활동"]
        :["자율 활동","동아리 활동","봉사 활동","진로 활동"],
    },
  };
}

export function isCreativeGroup(name:string):boolean{
  return /창의적\s*체험\s*활동|창체/.test(name);
}

export function creativeSubjectsForRevision(revision:MiddleRevision):readonly string[]{
  return middleCurriculumCatalog(revision).creative.subjects;
}
