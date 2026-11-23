/* FORM AI BETA 1.1.0 — original layered SVG character, no external runtime. */
(function(){
'use strict';
window.FormAICharacter = function(id){
  const g=(n)=>`${id}-${n}`;
  return `<svg class="fai-svg" viewBox="0 0 240 250" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="${g('hood')}" x1="0" y1="0" x2=".96" y2="1"><stop offset="0" stop-color="#717484"/><stop offset=".28" stop-color="#2f3343"/><stop offset=".7" stop-color="#121520"/><stop offset="1" stop-color="#787b92"/></linearGradient>
      <linearGradient id="${g('body')}" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#646879"/><stop offset=".36" stop-color="#242733"/><stop offset=".76" stop-color="#12141d"/><stop offset="1" stop-color="#4e5064"/></linearGradient>
      <radialGradient id="${g('face')}" cx=".55" cy=".43" r=".77"><stop stop-color="#141620"/><stop offset="1" stop-color="#030409"/></radialGradient>
      <filter id="${g('light')}" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3"/></filter>
    </defs>
    <ellipse class="fai-shadow" cx="120" cy="219" rx="65" ry="10" fill="none" stroke="currentColor" stroke-width="2" opacity=".38"/>
    <g class="fai-orbit-back" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".66"><ellipse cx="120" cy="157" rx="101" ry="26" transform="rotate(-12 120 157)"/></g>
    <g class="fai-float">
      <g class="fai-tail-left"><path d="M104 132Q75 147 42 194L64 185 66 208Q89 184 111 190Z" fill="url(#${g('body')})" stroke="#606473" stroke-width="1.4"/></g>
      <g class="fai-tail-right"><path d="M137 132Q162 148 189 202L170 189 162 211Q140 192 122 193Z" fill="url(#${g('body')})" stroke="#606473" stroke-width="1.4"/></g>
      <g class="fai-body"><path d="M87 125Q111 117 148 124L168 175 148 196 123 214 97 204 78 176Z" fill="url(#${g('body')})" stroke="#777b8d" stroke-width="1.7"/><path d="M120 139L123 208 103 191Z" fill="#a0a1b4" opacity=".15"/><path d="M88 159L64 201 102 190 115 214 123 171Z" fill="#161923"/><path d="M151 157L174 196 142 188 123 214 122 172Z" fill="#292b39"/><path d="M120 157L126 166 136 170 126 174 120 184 114 174 103 170 115 166Z" fill="currentColor" opacity=".85"/></g>
      <g class="fai-scarf"><path d="M66 129Q104 149 152 127Q170 136 159 147Q139 158 93 148Q74 170 57 181Q63 160 69 145Q60 139 66 129Z" fill="#3f414e" stroke="#86899b" stroke-width="1.6"/><path d="M79 136Q125 153 160 136" fill="none" stroke="#969aaf" stroke-width="4" opacity=".45"/></g>
      <g class="fai-head">
        <path d="M48 111Q58 53 109 24Q124 13 135 24Q177 41 193 111L201 137Q194 151 180 153L64 145Q41 139 48 111Z" fill="url(#${g('hood')})" stroke="#abb0c3" stroke-width="2.4"/>
        <path d="M54 114Q85 58 121 45Q155 47 184 109L178 142 67 141Z" fill="#07090e" stroke="#777c90" stroke-width="2.1"/>
        <path d="M70 113Q95 83 119 80Q151 78 170 116L164 140Q120 156 77 139Z" fill="url(#${g('face')})"/>
        <path d="M51 110Q67 49 119 23Q145 26 166 48Q141 41 118 48Q73 67 51 110Z" fill="#a3a7bc" opacity=".24"/>
        <path d="M57 112Q104 41 167 57" fill="none" stroke="#adb2c5" stroke-width="8" opacity=".16"/>
        <g class="fai-eyes" fill="#fff">
          <g class="fai-eye-normal"><ellipse cx="94" cy="116" rx="14" ry="13"/><ellipse cx="148" cy="116" rx="14" ry="13"/></g>
          <g class="fai-eye-happy" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round"><path d="M80 122Q94 101 108 121"/><path d="M134 122Q148 101 162 121"/></g>
          <g class="fai-eye-thinking"><path d="M80 122Q93 115 105 121" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none"/><ellipse cx="148" cy="118" rx="12" ry="8"/></g>
          <g class="fai-eye-sleep" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none"><path d="M81 124Q94 134 107 124"/><path d="M135 124Q148 134 161 124"/></g>
          <g class="fai-eye-talk"><ellipse cx="94" cy="116" rx="13" ry="12"/><path d="M137 117Q148 109 160 117" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none"/></g>
        </g>
        <g class="fai-eye-halo" fill="#fff" filter="url(#${g('light')})" opacity=".35"><ellipse cx="94" cy="117" rx="21" ry="16"/><ellipse cx="148" cy="117" rx="21" ry="16"/></g>
        <path d="M47 112Q44 128 59 143L75 149 64 132Z" fill="#5f6375" opacity=".9"/><path d="M188 108Q201 132 187 145L170 149 183 129Z" fill="#6b6e7f" opacity=".65"/>
      </g>
    </g>
    <g class="fai-orbit-front" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"><path d="M27 161C43 194 182 183 213 153"/><path d="M29 159C47 149 65 146 75 146" stroke-width="1.6" opacity=".45"/></g>
    <g class="fai-stars" fill="currentColor"><path d="M187 59l3 11 11 4-11 4-3 11-3-11-11-4 11-4Z"/><circle cx="35" cy="111" r="2.3"/><circle cx="207" cy="127" r="2"/></g>
    <g class="fai-thought" fill="currentColor"><circle cx="182" cy="36" r="3"/><circle cx="197" cy="25" r="5"/><circle cx="209" cy="16" r="2"/></g>
    <g class="fai-celebrate" fill="currentColor"><path d="M28 47l4 9 10 2-9 5-3 10-5-9-10-3 10-4z"/><circle cx="210" cy="84" r="4"/><path d="M192 22l3 7 8 2-7 4-2 8-4-7-8-3 8-3z"/></g>
  </svg>`;
};
})();
