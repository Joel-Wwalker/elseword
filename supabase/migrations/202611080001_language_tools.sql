-- Extend accepted documents without rewriting rows or changing authorization.
-- Apply after 202611070001_cloud_languages.sql; the initial migration is immutable.
begin;

create or replace function public.language_document_valid(doc jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  item jsonb;
  entry record;
  sounds jsonb;
  grammar jsonb;
  script jsonb;
  min_syllables integer;
  max_syllables integer;
  longest_consonant integer := 0;
  longest_vowel integer := 0;
  longest_syllable integer := 0;
  pattern text;
  rules jsonb;
  family jsonb;
  options jsonb;
  word_ids jsonb := '{}'::jsonb;
  english_keys jsonb := '{}'::jsonb;
  pending_families jsonb := '{}'::jsonb;
  resolved_ids jsonb := '{}'::jsonb;
  resolved_count integer;
  reference text;
  -- Unicode 17 Letter/Mark ranges match the browser's L/M categories.
  -- PostgreSQL alpha also admits circled letters and Roman numerals, so it
  -- cannot enforce this rule alone. Apostrophes are the only punctuation.
  sound_sequence_pattern constant text := U&'^[''’\0041-\005a\0061-\007a\00aa\00b5\00ba\00c0-\00d6\00d8-\00f6\00f8-\02c1\02c6-\02d1\02e0-\02e4\02ec\02ee\0300-\0374\0376-\0377\037a-\037d\037f\0386\0388-\038a\038c\038e-\03a1\03a3-\03f5\03f7-\0481\0483-\052f\0531-\0556\0559\0560-\0588\0591-\05bd\05bf\05c1-\05c2\05c4-\05c5\05c7\05d0-\05ea\05ef-\05f2\0610-\061a\0620-\065f\066e-\06d3\06d5-\06dc\06df-\06e8\06ea-\06ef\06fa-\06fc\06ff\0710-\074a\074d-\07b1\07ca-\07f5\07fa\07fd\0800-\082d\0840-\085b\0860-\086a\0870-\0887\0889-\088f\0897-\08e1\08e3-\0963\0971-\0983\0985-\098c\098f-\0990\0993-\09a8\09aa-\09b0\09b2\09b6-\09b9\09bc-\09c4\09c7-\09c8\09cb-\09ce\09d7\09dc-\09dd\09df-\09e3\09f0-\09f1\09fc\09fe\0a01-\0a03\0a05-\0a0a\0a0f-\0a10\0a13-\0a28'
    || U&'\0a2a-\0a30\0a32-\0a33\0a35-\0a36\0a38-\0a39\0a3c\0a3e-\0a42\0a47-\0a48\0a4b-\0a4d\0a51\0a59-\0a5c\0a5e\0a70-\0a75\0a81-\0a83\0a85-\0a8d\0a8f-\0a91\0a93-\0aa8\0aaa-\0ab0\0ab2-\0ab3\0ab5-\0ab9\0abc-\0ac5\0ac7-\0ac9\0acb-\0acd\0ad0\0ae0-\0ae3\0af9-\0aff\0b01-\0b03\0b05-\0b0c\0b0f-\0b10\0b13-\0b28\0b2a-\0b30\0b32-\0b33\0b35-\0b39\0b3c-\0b44\0b47-\0b48\0b4b-\0b4d\0b55-\0b57\0b5c-\0b5d\0b5f-\0b63\0b71\0b82-\0b83\0b85-\0b8a\0b8e-\0b90\0b92-\0b95\0b99-\0b9a\0b9c\0b9e-\0b9f\0ba3-\0ba4\0ba8-\0baa\0bae-\0bb9\0bbe-\0bc2\0bc6-\0bc8\0bca-\0bcd\0bd0\0bd7\0c00-\0c0c\0c0e-\0c10\0c12-\0c28\0c2a-\0c39\0c3c-\0c44\0c46-\0c48\0c4a-\0c4d\0c55-\0c56\0c58-\0c5a\0c5c-\0c5d\0c60-\0c63\0c80-\0c83\0c85-\0c8c\0c8e-\0c90'
    || U&'\0c92-\0ca8\0caa-\0cb3\0cb5-\0cb9\0cbc-\0cc4\0cc6-\0cc8\0cca-\0ccd\0cd5-\0cd6\0cdc-\0cde\0ce0-\0ce3\0cf1-\0cf3\0d00-\0d0c\0d0e-\0d10\0d12-\0d44\0d46-\0d48\0d4a-\0d4e\0d54-\0d57\0d5f-\0d63\0d7a-\0d7f\0d81-\0d83\0d85-\0d96\0d9a-\0db1\0db3-\0dbb\0dbd\0dc0-\0dc6\0dca\0dcf-\0dd4\0dd6\0dd8-\0ddf\0df2-\0df3\0e01-\0e3a\0e40-\0e4e\0e81-\0e82\0e84\0e86-\0e8a\0e8c-\0ea3\0ea5\0ea7-\0ebd\0ec0-\0ec4\0ec6\0ec8-\0ece\0edc-\0edf\0f00\0f18-\0f19\0f35\0f37\0f39\0f3e-\0f47\0f49-\0f6c\0f71-\0f84\0f86-\0f97\0f99-\0fbc\0fc6\1000-\103f\1050-\108f\109a-\109d\10a0-\10c5\10c7\10cd\10d0-\10fa\10fc-\1248\124a-\124d\1250-\1256\1258\125a-\125d\1260-\1288\128a-\128d\1290-\12b0\12b2-\12b5\12b8-\12be\12c0\12c2-\12c5'
    || U&'\12c8-\12d6\12d8-\1310\1312-\1315\1318-\135a\135d-\135f\1380-\138f\13a0-\13f5\13f8-\13fd\1401-\166c\166f-\167f\1681-\169a\16a0-\16ea\16f1-\16f8\1700-\1715\171f-\1734\1740-\1753\1760-\176c\176e-\1770\1772-\1773\1780-\17d3\17d7\17dc-\17dd\180b-\180d\180f\1820-\1878\1880-\18aa\18b0-\18f5\1900-\191e\1920-\192b\1930-\193b\1950-\196d\1970-\1974\1980-\19ab\19b0-\19c9\1a00-\1a1b\1a20-\1a5e\1a60-\1a7c\1a7f\1aa7\1ab0-\1add\1ae0-\1aeb\1b00-\1b4c\1b6b-\1b73\1b80-\1baf\1bba-\1bf3\1c00-\1c37\1c4d-\1c4f\1c5a-\1c7d\1c80-\1c8a\1c90-\1cba\1cbd-\1cbf\1cd0-\1cd2\1cd4-\1cfa\1d00-\1f15\1f18-\1f1d\1f20-\1f45\1f48-\1f4d\1f50-\1f57\1f59\1f5b\1f5d\1f5f-\1f7d\1f80-\1fb4\1fb6-\1fbc\1fbe\1fc2-\1fc4\1fc6-\1fcc\1fd0-\1fd3'
    || U&'\1fd6-\1fdb\1fe0-\1fec\1ff2-\1ff4\1ff6-\1ffc\2071\207f\2090-\209c\20d0-\20f0\2102\2107\210a-\2113\2115\2119-\211d\2124\2126\2128\212a-\212d\212f-\2139\213c-\213f\2145-\2149\214e\2183-\2184\2c00-\2ce4\2ceb-\2cf3\2d00-\2d25\2d27\2d2d\2d30-\2d67\2d6f\2d7f-\2d96\2da0-\2da6\2da8-\2dae\2db0-\2db6\2db8-\2dbe\2dc0-\2dc6\2dc8-\2dce\2dd0-\2dd6\2dd8-\2dde\2de0-\2dff\2e2f\3005-\3006\302a-\302f\3031-\3035\303b-\303c\3041-\3096\3099-\309a\309d-\309f\30a1-\30fa\30fc-\30ff\3105-\312f\3131-\318e\31a0-\31bf\31f0-\31ff\3400-\4dbf\4e00-\a48c\a4d0-\a4fd\a500-\a60c\a610-\a61f\a62a-\a62b\a640-\a672\a674-\a67d\a67f-\a6e5\a6f0-\a6f1\a717-\a71f\a722-\a788\a78b-\a7dc\a7f1-\a827\a82c\a840-\a873\a880-\a8c5\a8e0-\a8f7'
    || U&'\a8fb\a8fd-\a8ff\a90a-\a92d\a930-\a953\a960-\a97c\a980-\a9c0\a9cf\a9e0-\a9ef\a9fa-\a9fe\aa00-\aa36\aa40-\aa4d\aa60-\aa76\aa7a-\aac2\aadb-\aadd\aae0-\aaef\aaf2-\aaf6\ab01-\ab06\ab09-\ab0e\ab11-\ab16\ab20-\ab26\ab28-\ab2e\ab30-\ab5a\ab5c-\ab69\ab70-\abea\abec-\abed\ac00-\d7a3\d7b0-\d7c6\d7cb-\d7fb\f900-\fa6d\fa70-\fad9\fb00-\fb06\fb13-\fb17\fb1d-\fb28\fb2a-\fb36\fb38-\fb3c\fb3e\fb40-\fb41\fb43-\fb44\fb46-\fbb1\fbd3-\fd3d\fd50-\fd8f\fd92-\fdc7\fdf0-\fdfb\fe00-\fe0f\fe20-\fe2f\fe70-\fe74\fe76-\fefc\ff21-\ff3a\ff41-\ff5a\ff66-\ffbe\ffc2-\ffc7\ffca-\ffcf\ffd2-\ffd7\ffda-\ffdc\+010000-\+01000b\+01000d-\+010026\+010028-\+01003a\+01003c-\+01003d\+01003f-\+01004d\+010050-\+01005d\+010080-\+0100fa'
    || U&'\+0101fd\+010280-\+01029c\+0102a0-\+0102d0\+0102e0\+010300-\+01031f\+01032d-\+010340\+010342-\+010349\+010350-\+01037a\+010380-\+01039d\+0103a0-\+0103c3\+0103c8-\+0103cf\+010400-\+01049d\+0104b0-\+0104d3\+0104d8-\+0104fb\+010500-\+010527\+010530-\+010563\+010570-\+01057a\+01057c-\+01058a\+01058c-\+010592\+010594-\+010595\+010597-\+0105a1\+0105a3-\+0105b1\+0105b3-\+0105b9\+0105bb-\+0105bc\+0105c0-\+0105f3\+010600-\+010736\+010740-\+010755\+010760-\+010767\+010780-\+010785\+010787-\+0107b0\+0107b2-\+0107ba\+010800-\+010805\+010808\+01080a-\+010835\+010837-\+010838\+01083c\+01083f-\+010855\+010860-\+010876\+010880-\+01089e\+0108e0-\+0108f2\+0108f4-\+0108f5\+010900-\+010915\+010920-\+010939'
    || U&'\+010940-\+010959\+010980-\+0109b7\+0109be-\+0109bf\+010a00-\+010a03\+010a05-\+010a06\+010a0c-\+010a13\+010a15-\+010a17\+010a19-\+010a35\+010a38-\+010a3a\+010a3f\+010a60-\+010a7c\+010a80-\+010a9c\+010ac0-\+010ac7\+010ac9-\+010ae6\+010b00-\+010b35\+010b40-\+010b55\+010b60-\+010b72\+010b80-\+010b91\+010c00-\+010c48\+010c80-\+010cb2\+010cc0-\+010cf2\+010d00-\+010d27\+010d4a-\+010d65\+010d69-\+010d6d\+010d6f-\+010d85\+010e80-\+010ea9\+010eab-\+010eac\+010eb0-\+010eb1\+010ec2-\+010ec7\+010efa-\+010f1c\+010f27\+010f30-\+010f50\+010f70-\+010f85\+010fb0-\+010fc4\+010fe0-\+010ff6\+011000-\+011046\+011070-\+011075\+01107f-\+0110ba\+0110c2\+0110d0-\+0110e8\+011100-\+011134\+011144-\+011147'
    || U&'\+011150-\+011173\+011176\+011180-\+0111c4\+0111c9-\+0111cc\+0111ce-\+0111cf\+0111da\+0111dc\+011200-\+011211\+011213-\+011237\+01123e-\+011241\+011280-\+011286\+011288\+01128a-\+01128d\+01128f-\+01129d\+01129f-\+0112a8\+0112b0-\+0112ea\+011300-\+011303\+011305-\+01130c\+01130f-\+011310\+011313-\+011328\+01132a-\+011330\+011332-\+011333\+011335-\+011339\+01133b-\+011344\+011347-\+011348\+01134b-\+01134d\+011350\+011357\+01135d-\+011363\+011366-\+01136c\+011370-\+011374\+011380-\+011389\+01138b\+01138e\+011390-\+0113b5\+0113b7-\+0113c0\+0113c2\+0113c5\+0113c7-\+0113ca\+0113cc-\+0113d3\+0113e1-\+0113e2\+011400-\+01144a\+01145e-\+011461\+011480-\+0114c5\+0114c7\+011580-\+0115b5\+0115b8-\+0115c0'
    || U&'\+0115d8-\+0115dd\+011600-\+011640\+011644\+011680-\+0116b8\+011700-\+01171a\+01171d-\+01172b\+011740-\+011746\+011800-\+01183a\+0118a0-\+0118df\+0118ff-\+011906\+011909\+01190c-\+011913\+011915-\+011916\+011918-\+011935\+011937-\+011938\+01193b-\+011943\+0119a0-\+0119a7\+0119aa-\+0119d7\+0119da-\+0119e1\+0119e3-\+0119e4\+011a00-\+011a3e\+011a47\+011a50-\+011a99\+011a9d\+011ab0-\+011af8\+011b60-\+011b67\+011bc0-\+011be0\+011c00-\+011c08\+011c0a-\+011c36\+011c38-\+011c40\+011c72-\+011c8f\+011c92-\+011ca7\+011ca9-\+011cb6\+011d00-\+011d06\+011d08-\+011d09\+011d0b-\+011d36\+011d3a\+011d3c-\+011d3d\+011d3f-\+011d47\+011d60-\+011d65\+011d67-\+011d68\+011d6a-\+011d8e\+011d90-\+011d91'
    || U&'\+011d93-\+011d98\+011db0-\+011ddb\+011ee0-\+011ef6\+011f00-\+011f10\+011f12-\+011f3a\+011f3e-\+011f42\+011f5a\+011fb0\+012000-\+012399\+012480-\+012543\+012f90-\+012ff0\+013000-\+01342f\+013440-\+013455\+013460-\+0143fa\+014400-\+014646\+016100-\+01612f\+016800-\+016a38\+016a40-\+016a5e\+016a70-\+016abe\+016ad0-\+016aed\+016af0-\+016af4\+016b00-\+016b36\+016b40-\+016b43\+016b63-\+016b77\+016b7d-\+016b8f\+016d40-\+016d6c\+016e40-\+016e7f\+016ea0-\+016eb8\+016ebb-\+016ed3\+016f00-\+016f4a\+016f4f-\+016f87\+016f8f-\+016f9f\+016fe0-\+016fe1\+016fe3-\+016fe4\+016ff0-\+016ff3\+017000-\+018cd5\+018cff-\+018d1e\+018d80-\+018df2\+01aff0-\+01aff3\+01aff5-\+01affb\+01affd-\+01affe\+01b000-\+01b122'
    || U&'\+01b132\+01b150-\+01b152\+01b155\+01b164-\+01b167\+01b170-\+01b2fb\+01bc00-\+01bc6a\+01bc70-\+01bc7c\+01bc80-\+01bc88\+01bc90-\+01bc99\+01bc9d-\+01bc9e\+01cf00-\+01cf2d\+01cf30-\+01cf46\+01d165-\+01d169\+01d16d-\+01d172\+01d17b-\+01d182\+01d185-\+01d18b\+01d1aa-\+01d1ad\+01d242-\+01d244\+01d400-\+01d454\+01d456-\+01d49c\+01d49e-\+01d49f\+01d4a2\+01d4a5-\+01d4a6\+01d4a9-\+01d4ac\+01d4ae-\+01d4b9\+01d4bb\+01d4bd-\+01d4c3\+01d4c5-\+01d505\+01d507-\+01d50a\+01d50d-\+01d514\+01d516-\+01d51c\+01d51e-\+01d539\+01d53b-\+01d53e\+01d540-\+01d544\+01d546\+01d54a-\+01d550\+01d552-\+01d6a5\+01d6a8-\+01d6c0\+01d6c2-\+01d6da\+01d6dc-\+01d6fa\+01d6fc-\+01d714\+01d716-\+01d734\+01d736-\+01d74e'
    || U&'\+01d750-\+01d76e\+01d770-\+01d788\+01d78a-\+01d7a8\+01d7aa-\+01d7c2\+01d7c4-\+01d7cb\+01da00-\+01da36\+01da3b-\+01da6c\+01da75\+01da84\+01da9b-\+01da9f\+01daa1-\+01daaf\+01df00-\+01df1e\+01df25-\+01df2a\+01e000-\+01e006\+01e008-\+01e018\+01e01b-\+01e021\+01e023-\+01e024\+01e026-\+01e02a\+01e030-\+01e06d\+01e08f\+01e100-\+01e12c\+01e130-\+01e13d\+01e14e\+01e290-\+01e2ae\+01e2c0-\+01e2ef\+01e4d0-\+01e4ef\+01e5d0-\+01e5f0\+01e6c0-\+01e6de\+01e6e0-\+01e6f5\+01e6fe-\+01e6ff\+01e7e0-\+01e7e6\+01e7e8-\+01e7eb\+01e7ed-\+01e7ee\+01e7f0-\+01e7fe\+01e800-\+01e8c4\+01e8d0-\+01e8d6\+01e900-\+01e94b\+01ee00-\+01ee03\+01ee05-\+01ee1f\+01ee21-\+01ee22\+01ee24\+01ee27\+01ee29-\+01ee32\+01ee34-\+01ee37'
    || U&'\+01ee39\+01ee3b\+01ee42\+01ee47\+01ee49\+01ee4b\+01ee4d-\+01ee4f\+01ee51-\+01ee52\+01ee54\+01ee57\+01ee59\+01ee5b\+01ee5d\+01ee5f\+01ee61-\+01ee62\+01ee64\+01ee67-\+01ee6a\+01ee6c-\+01ee72\+01ee74-\+01ee77\+01ee79-\+01ee7c\+01ee7e\+01ee80-\+01ee89\+01ee8b-\+01ee9b\+01eea1-\+01eea3\+01eea5-\+01eea9\+01eeab-\+01eebb\+020000-\+02a6df\+02a700-\+02b81d\+02b820-\+02cead\+02ceb0-\+02ebe0\+02ebf0-\+02ee5d\+02f800-\+02fa1d\+030000-\+03134a\+031350-\+033479\+0e0100-\+0e01ef]+$';
begin
  if doc is null or jsonb_typeof(doc) <> 'object' or octet_length(doc::text) > 1000000 then return false; end if;
  if exists (select 1 from jsonb_object_keys(doc) k where k not in ('version','id','name','seed','preset','sounds','grammar','script','words','revision','phrases')) then return false; end if;
  if (doc->'version' is distinct from '1'::jsonb and doc->'version' is distinct from '2'::jsonb)
    or not public.language_text_valid(doc->'id',80) or (doc->>'id') !~ '^[A-Za-z0-9][A-Za-z0-9_-]*$'
    or not public.language_text_valid(doc->'name',60)
    or not public.language_text_valid(doc->'seed',128)
    or (doc->>'preset') is null or (doc->>'preset') not in ('soft','crisp','earthy','strange')
    or jsonb_typeof(doc->'revision') is distinct from 'number'
    or (doc->>'revision') !~ '^[0-9]+$' or length(doc->>'revision') > 7 then return false; end if;
  if (doc->>'revision')::integer > 1000000 then return false; end if;

  sounds := doc->'sounds';
  if jsonb_typeof(sounds) is distinct from 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(sounds) k where k not in ('consonants','vowels','patterns','minSyllables','maxSyllables','rules')) then return false; end if;
  if jsonb_typeof(sounds->'consonants') is distinct from 'array'
    or jsonb_typeof(sounds->'vowels') is distinct from 'array'
    or jsonb_typeof(sounds->'patterns') is distinct from 'array' then return false; end if;
  if jsonb_array_length(sounds->'consonants') > 40 or jsonb_array_length(sounds->'vowels') not between 1 and 40
    or jsonb_array_length(sounds->'patterns') not between 1 and 20 then return false; end if;
  for item in select value from jsonb_array_elements(sounds->'consonants') loop
    if not public.language_text_valid(item,8) then return false; end if;
    longest_consonant := greatest(longest_consonant,char_length(item #>> '{}'));
  end loop;
  for item in select value from jsonb_array_elements(sounds->'vowels') loop
    if not public.language_text_valid(item,8) then return false; end if;
    longest_vowel := greatest(longest_vowel,char_length(item #>> '{}'));
  end loop;
  if jsonb_typeof(sounds->'minSyllables') is distinct from 'number'
    or jsonb_typeof(sounds->'maxSyllables') is distinct from 'number'
    or (sounds->>'minSyllables') !~ '^[1-5]$' or (sounds->>'maxSyllables') !~ '^[1-5]$' then return false; end if;
  min_syllables := (sounds->>'minSyllables')::integer;
  max_syllables := (sounds->>'maxSyllables')::integer;
  if min_syllables > max_syllables then return false; end if;
  for item in select value from jsonb_array_elements(sounds->'patterns') loop
    if jsonb_typeof(item) <> 'string' then return false; end if;
    pattern := item #>> '{}';
    if pattern not in ('CV','CVC','V','VC','CCV') then return false; end if;
    if position('C' in pattern) > 0 and longest_consonant = 0 then return false; end if;
    longest_syllable := greatest(longest_syllable,
      (length(pattern)-length(replace(pattern,'C',''))) * longest_consonant
      + (length(pattern)-length(replace(pattern,'V',''))) * longest_vowel);
  end loop;
  if longest_syllable * max_syllables > 80 then return false; end if;

  if sounds ? 'rules' then
    rules := sounds->'rules';
    if jsonb_typeof(rules) is distinct from 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(rules) k where k not in ('initial','final','forbidden','weights')) then return false; end if;
    foreach pattern in array array['initial','final','forbidden'] loop
      if jsonb_typeof(rules->pattern) is distinct from 'array' then return false; end if;
      if jsonb_array_length(rules->pattern) > 40 then return false; end if;
      for item in select value from jsonb_array_elements(rules->pattern) loop
        if not public.language_text_valid(item,16) or (item #>> '{}') !~ sound_sequence_pattern then return false; end if;
      end loop;
      if exists (select 1 from jsonb_array_elements(rules->pattern) value group by value having count(*)>1) then return false; end if;
    end loop;
    if jsonb_typeof(rules->'weights') is distinct from 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(rules->'weights')) > 80 then return false; end if;
    for entry in select key,value from jsonb_each(rules->'weights') loop
      if lower(entry.key) in ('__proto__','constructor','prototype')
        or not (sounds->'consonants' ? entry.key or sounds->'vowels' ? entry.key)
        or jsonb_typeof(entry.value) is distinct from 'number' then return false; end if;
      if (entry.value #>> '{}')::numeric <= 0 or (entry.value #>> '{}')::numeric > 100 then return false; end if;
    end loop;
  end if;

  grammar := doc->'grammar';
  if jsonb_typeof(grammar) is distinct from 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(grammar) k where k not in ('order','adjective','plural','past','future','negative','question')) then return false; end if;
  if (grammar->>'order') is null or (grammar->>'order') not in ('SVO','SOV','VSO','VOS','OSV','OVS')
    or (grammar->>'adjective') is null or (grammar->>'adjective') not in ('before','after') then return false; end if;
  foreach pattern in array array['plural','past','future','negative','question'] loop
    if not public.language_text_valid(grammar->pattern,20,true) then return false; end if;
  end loop;

  script := doc->'script';
  if jsonb_typeof(script) is distinct from 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(script) k where k not in ('style','direction','glyphs')) then return false; end if;
  if (script->>'style') is null or (script->>'style') not in ('latin','runes','custom')
    or (script->>'direction') is null or (script->>'direction') not in ('ltr','rtl')
    or jsonb_typeof(script->'glyphs') is distinct from 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(script->'glyphs')) > 128 then return false; end if;
  for entry in select key,value from jsonb_each(script->'glyphs') loop
    if not public.language_text_valid(to_jsonb(entry.key),8) or lower(entry.key) in ('__proto__','constructor','prototype')
      or not public.language_text_valid(entry.value,16) then return false; end if;
  end loop;

  if jsonb_typeof(doc->'words') is distinct from 'array' then return false; end if;
  if jsonb_array_length(doc->'words') > 2000 then return false; end if;
  for item in select value from jsonb_array_elements(doc->'words') loop
    if jsonb_typeof(item) <> 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(item) k where k not in ('id','english','word','pos','category','locked','notes','family')) then return false; end if;
    if not public.language_text_valid(item->'id',80) or (item->>'id') !~ '^[[:alnum:]][[:alnum:]_-]*$'
      or not public.language_text_valid(item->'english',80)
      or not public.language_text_valid(item->'word',80)
      or not public.language_text_valid(item->'pos',30)
      or not public.language_text_valid(item->'category',60)
      or not public.language_text_valid(item->'notes',500,true,true)
      or jsonb_typeof(item->'locked') is distinct from 'boolean' then return false; end if;
    word_ids := word_ids || jsonb_build_object(item->>'id',true);
    english_keys := english_keys || jsonb_build_object(lower(regexp_replace(btrim(normalize(item->>'english',NFC)), '\s+', ' ', 'g')),true);
    if item ? 'family' then
      family := item->'family';
      if jsonb_typeof(family) is distinct from 'object' then return false; end if;
      if exists (select 1 from jsonb_object_keys(family) k where k not in ('rootId','kind','otherRootId')) then return false; end if;
      if not public.language_text_valid(family->'rootId',80)
        or (family->>'rootId') !~ '^[[:alnum:]][[:alnum:]_-]*$'
        or (family->>'kind') is null or (family->>'kind') not in ('plural','alias','compound') then return false; end if;
      if family->>'kind' = 'compound' then
        if not public.language_text_valid(family->'otherRootId',80)
          or (family->>'otherRootId') !~ '^[[:alnum:]][[:alnum:]_-]*$' then return false; end if;
      elsif family ? 'otherRootId' then return false;
      end if;
      pending_families := pending_families || jsonb_build_object(item->>'id',family);
    else
      resolved_ids := resolved_ids || jsonb_build_object(item->>'id',true);
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(doc->'words') w group by w->>'id' having count(*)>1)
    or exists (select 1 from jsonb_array_elements(doc->'words') w group by lower(regexp_replace(btrim(normalize(w->>'english',NFC)), '\s+', ' ', 'g')) having count(*)>1)
    then return false; end if;

  for entry in select key,value from jsonb_each(pending_families) loop
    if not word_ids ? (entry.value->>'rootId')
      or (entry.value->>'kind' = 'compound' and not word_ids ? (entry.value->>'otherRootId')) then return false; end if;
  end loop;
  -- Resolve each node once without enumerating paths. A cycle leaves no next
  -- resolvable node. Work remains bounded even for compound diamond graphs.
  while pending_families <> '{}'::jsonb loop
    resolved_count := 0;
    for entry in select key,value from jsonb_each(pending_families) loop
      if resolved_ids ? (entry.value->>'rootId')
        and (entry.value->>'kind' <> 'compound' or resolved_ids ? (entry.value->>'otherRootId')) then
        resolved_ids := resolved_ids || jsonb_build_object(entry.key,true);
        pending_families := pending_families - entry.key;
        resolved_count := resolved_count + 1;
      end if;
    end loop;
    if resolved_count = 0 then return false; end if;
  end loop;

  if doc ? 'phrases' then
    if jsonb_typeof(doc->'phrases') is distinct from 'array' then return false; end if;
    if jsonb_array_length(doc->'phrases') > 50 then return false; end if;
    for item in select value from jsonb_array_elements(doc->'phrases') loop
      if jsonb_typeof(item) is distinct from 'object' then return false; end if;
      if exists (select 1 from jsonb_object_keys(item) k where k not in ('id','name','options')) then return false; end if;
      if not public.language_text_valid(item->'id',80) or (item->>'id') !~ '^[[:alnum:]][[:alnum:]_-]*$'
        or not public.language_text_valid(item->'name',80) then return false; end if;
      options := item->'options';
      if jsonb_typeof(options) is distinct from 'object' then return false; end if;
      if exists (select 1 from jsonb_object_keys(options) k where k not in ('subject','verb','object','adjective','tense','plural','negative','question')) then return false; end if;
      foreach pattern in array array['subject','verb','object','adjective'] loop
        if not public.language_text_valid(options->pattern,80,true) then return false; end if;
        reference := options->>pattern;
        if reference <> '' and not word_ids ? reference
          and not english_keys ? lower(regexp_replace(btrim(normalize(reference,NFC)), '\s+', ' ', 'g')) then return false; end if;
      end loop;
      if (options->>'tense') is null or (options->>'tense') not in ('present','past','future') then return false; end if;
      foreach pattern in array array['plural','negative','question'] loop
        if jsonb_typeof(options->pattern) is distinct from 'boolean' then return false; end if;
      end loop;
    end loop;
    if exists (select 1 from jsonb_array_elements(doc->'phrases') phrase group by phrase->>'id' having count(*)>1) then return false; end if;
  end if;
  return true;
exception when others then
  -- Malformed JSON shapes and numeric casts are validation failures, not
  -- database details to expose to visitors.
  return false;
end;
$$;

-- CREATE OR REPLACE retains the original helper's restricted execution grants.
revoke all on function public.language_document_valid(jsonb) from public,anon,authenticated;

commit;
