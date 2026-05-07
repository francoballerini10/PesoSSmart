import React from 'react';
import Svg, {
  Defs,
  RadialGradient,
  LinearGradient,
  Stop,
  Ellipse,
  Path,
  Text as SvgText,
} from 'react-native-svg';

export function MoneyBagIcon({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <Defs>
        {/* bag body — warm beige, light from top-left */}
        <RadialGradient id="mb_bag" cx="36%" cy="30%" r="68%" fx="32%" fy="26%">
          <Stop offset="0%"   stopColor="#FDF3E0"/>
          <Stop offset="40%"  stopColor="#F5E1C8"/>
          <Stop offset="80%"  stopColor="#E5C49A"/>
          <Stop offset="100%" stopColor="#D4AA7A"/>
        </RadialGradient>

        {/* bag neck */}
        <LinearGradient id="mb_neck" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%"   stopColor="#D8B882"/>
          <Stop offset="50%"  stopColor="#EDD09A"/>
          <Stop offset="100%" stopColor="#C8A870"/>
        </LinearGradient>

        {/* green knot center */}
        <RadialGradient id="mb_knot" cx="38%" cy="30%" r="65%">
          <Stop offset="0%"   stopColor="#81C784"/>
          <Stop offset="55%"  stopColor="#388E3C"/>
          <Stop offset="100%" stopColor="#1B5E20"/>
        </RadialGradient>

        {/* green knot loops */}
        <RadialGradient id="mb_kloop" cx="40%" cy="30%" r="65%">
          <Stop offset="0%"   stopColor="#66BB6A"/>
          <Stop offset="60%"  stopColor="#2E7D32"/>
          <Stop offset="100%" stopColor="#1B5E20"/>
        </RadialGradient>

        {/* coin face — golden */}
        <RadialGradient id="mb_coin" cx="38%" cy="28%" r="68%">
          <Stop offset="0%"   stopColor="#FFE97A"/>
          <Stop offset="40%"  stopColor="#F4C542"/>
          <Stop offset="75%"  stopColor="#DBA020"/>
          <Stop offset="100%" stopColor="#C08A10"/>
        </RadialGradient>

        {/* coin edge — darker gold for thickness illusion */}
        <LinearGradient id="mb_cedge" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%"   stopColor="#C89010"/>
          <Stop offset="100%" stopColor="#8A5E00"/>
        </LinearGradient>
      </Defs>

      {/* ── COINS (drawn first so bag overlaps partially) ── */}
      {/* Coin 1 — back-left */}
      <Ellipse cx={158} cy={406} rx={56} ry={56} fill="url(#mb_cedge)"/>
      <Ellipse cx={158} cy={394} rx={56} ry={56} fill="url(#mb_coin)"/>
      <Ellipse cx={142} cy={378} rx={20} ry={14} fill="rgba(255,255,255,0.34)"
               transform="rotate(-20 142 378)"/>

      {/* Coin 2 — middle */}
      <Ellipse cx={194} cy={418} rx={56} ry={56} fill="url(#mb_cedge)"/>
      <Ellipse cx={194} cy={406} rx={56} ry={56} fill="url(#mb_coin)"/>
      <Ellipse cx={178} cy={390} rx={20} ry={14} fill="rgba(255,255,255,0.34)"
               transform="rotate(-20 178 390)"/>

      {/* Coin 3 — front-right */}
      <Ellipse cx={230} cy={430} rx={56} ry={56} fill="url(#mb_cedge)"/>
      <Ellipse cx={230} cy={418} rx={56} ry={56} fill="url(#mb_coin)"/>
      <Ellipse cx={214} cy={402} rx={20} ry={14} fill="rgba(255,255,255,0.34)"
               transform="rotate(-20 214 402)"/>

      {/* ── BAG BODY ── */}
      {/* dark shadow base */}
      <Path
        d="M 256 158 C 192 158, 114 196, 99 278 C 86 349, 118 420, 185 444 C 213 455, 238 460, 256 460 C 274 460, 300 455, 328 444 C 396 418, 428 347, 415 276 C 400 194, 322 158, 256 158 Z"
        fill="#C8A068"
      />
      {/* main body */}
      <Path
        d="M 256 152 C 192 152, 114 190, 99 272 C 86 343, 118 414, 185 438 C 213 449, 238 454, 256 454 C 274 454, 300 449, 328 438 C 396 412, 428 341, 415 270 C 400 188, 322 152, 256 152 Z"
        fill="url(#mb_bag)"
      />
      {/* specular highlight */}
      <Ellipse cx={208} cy={248} rx={62} ry={78} fill="rgba(255,255,255,0.17)"
               transform="rotate(-22 208 248)"/>
      {/* bottom volume shadow */}
      <Path
        d="M 138 390 C 130 430, 170 458, 256 460 C 342 462, 385 432, 378 390 C 365 425, 325 450, 256 452 C 188 454, 150 422, 138 390 Z"
        fill="rgba(0,0,0,0.06)"
      />

      {/* ── BAG NECK (fruncida) ── */}
      <Path
        d="M 224 152 C 222 138, 224 122, 230 110 C 237 98, 246 90, 256 88 C 266 90, 275 98, 282 110 C 288 122, 290 138, 288 152 C 278 144, 268 140, 256 140 C 244 140, 234 144, 224 152 Z"
        fill="url(#mb_neck)"
      />

      {/* ── GREEN KNOT / BOW ── */}
      {/* left loop */}
      <Ellipse cx={232} cy={88} rx={22} ry={13} fill="url(#mb_kloop)"
               transform="rotate(-30 232 88)"/>
      {/* right loop */}
      <Ellipse cx={280} cy={88} rx={22} ry={13} fill="url(#mb_kloop)"
               transform="rotate(30 280 88)"/>
      {/* center knot */}
      <Ellipse cx={256} cy={90} rx={18} ry={14} fill="url(#mb_knot)"/>
      {/* knot highlight */}
      <Ellipse cx={250} cy={84} rx={8} ry={5} fill="rgba(255,255,255,0.25)"
               transform="rotate(-10 250 84)"/>

      {/* ── DOLLAR SIGN ── */}
      <SvgText
        x={258}
        y={336}
        fontSize={168}
        fontWeight="600"
        fill="#6D4C41"
        textAnchor="middle"
        opacity={0.90}
      >
        $
      </SvgText>
    </Svg>
  );
}
