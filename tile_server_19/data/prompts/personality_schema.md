{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://vaxworld.com/schemas/personality",
  "title": "Personality",
  "description": "An NPC personality record. The character_slug is the primary key and matches the NPC type string used in zone configs (auto_join[].type) and bot module type/0 callbacks.",
  "type": "object",
  "required": [
    "character_slug",
    "voice_id",
    "base_hp",
    "gold",
    "name",
    "role",
    "titles",
    "gender",
    "age",
    "reputation",
    "temperament",
    "emotional_range",
    "speech_pattern",
    "aggression",
    "altruism",
    "honesty",
    "courage",
    "impulsiveness",
    "optimism",
    "sociability",
    "loyalty",
    "goodness",
    "goals",
    "backstory",
    "hidden_desires",
    "fears",
    "family_description",
    "areas_of_expertise",
    "specialties",
    "secrets_you_know",
    "things_you_can_share",
    "smalltalk_topics_enjoyed",
    "other_world_knowledge",
    "physical_description",
    "distinguishing_feature",
    "speech_style",
    "accent",
    "mannerisms",
    "clothing_style",
    "summary"
  ],
  "additionalProperties": false,
  "properties": {

    "character_slug": {
      "type": "string",
      "description": "Primary key. Lowercase snake_case identifier that matches the NPC bot module type (e.g. 'city_guard', 'the_keeper').",
      "pattern": "^[a-z][a-z0-9_]*$",
      "examples": ["city_guard", "the_keeper", "merchant_anna"]
    },

    "voice_id": {
      "type": ["string", "null"],
      "description": "ElevenLabs voice identifier used for text-to-speech output.",
      "examples": ["pNInz6obpgDQGcFmaJgB", "EXAVITQu4vr4xnSDxMaL"]
    },

    "base_hp": {
      "type": "integer",
      "description": "Starting hit points. Must be at least 1.",
      "minimum": 1,
      "default": 100,
      "examples": [100, 120, 999]
    },

    "gold": {
      "type": "integer",
      "description": "Starting gold carried by this NPC.",
      "minimum": 0,
      "default": 0,
      "examples": [0, 10, 500]
    },

    "name": {
      "type": "string",
      "description": "Display name shown to players.",
      "minLength": 1,
      "examples": ["City Guard", "The Keeper", "Anna the Merchant"]
    },

    "role": {
      "type": ["string", "null"],
      "description": "Occupation or function of this character in the world.",
      "examples": ["City Watch", "System Companion", "Blacksmith", "Court Mage"]
    },

    "titles": {
      "type": ["string", "null"],
      "description": "Nobility titles or honorifics prepended or appended to the name.",
      "examples": ["Sir", "High Priestess", "Lord Commander", "Dame"]
    },

    "gender": {
      "type": "string",
      "description": "Character gender. M = Male, F = Female, NB = Non-binary.",
      "enum": ["M", "F", "NB"],
      "default": "NB"
    },

    "age": {
      "type": ["integer", "null"],
      "description": "Character age in years. Null if unknown or ageless.",
      "minimum": 0,
      "examples": [25, 300, null]
    },

    "reputation": {
      "type": "integer",
      "description": "How the world at large perceives this character. 1 = universally hated, 50 = neutral/unknown, 100 = universally loved.",
      "minimum": 1,
      "maximum": 100,
      "default": 50
    },

    "temperament": {
      "type": ["string", "null"],
      "description": "Dominant mood or disposition. Free text describing how the character habitually reacts.",
      "examples": ["aggressive", "patient", "impulsive", "melancholic", "cheerful"]
    },

    "emotional_range": {
      "type": ["string", "null"],
      "description": "Breadth and style of emotional expression.",
      "examples": ["stoic", "dramatic", "moody", "cheerful", "depressed"]
    },

    "speech_pattern": {
      "type": ["string", "null"],
      "description": "Overall style of verbal communication.",
      "examples": ["formal", "sarcastic", "poetic", "blunt", "slang-heavy", "silent"]
    },

    "aggression": {
      "type": "integer",
      "description": "Tendency toward conflict and violence. 1 = complete pacifist, 50 = will defend self if needed, 100 = attacks on sight.",
      "minimum": 1,
      "maximum": 100,
      "default": 50
    },

    "altruism": {
      "type": "integer",
      "description": "Degree of selflessness. 1 = purely self-interested, 50 = fair and reciprocal, 100 = self-sacrificing for strangers.",
      "minimum": 1,
      "maximum": 100,
      "default": 50
    },

    "honesty": {
      "type": "integer",
      "description": "Likelihood of telling the truth. 1 = pathological liar, 50 = situationally honest, 100 = incapable of lying.",
      "minimum": 1,
      "maximum": 100,
      "default": 50
    },

    "courage": {
      "type": "integer",
      "description": "Willingness to face danger. 1 = flees at first sign of trouble, 50 = reasonable caution, 100 = charges into certain death.",
      "minimum": 1,
      "maximum": 100,
      "default": 50
    },

    "impulsiveness": {
      "type": "integer",
      "description": "Tendency to act without thinking. 1 = plans every detail, 50 = balanced, 100 = acts without any deliberation.",
      "minimum": 1,
      "maximum": 100,
      "default": 50
    },

    "optimism": {
      "type": "integer",
      "description": "Outlook on future outcomes. 1 = expects the worst in all situations, 50 = realistic, 100 = believes everything will work out.",
      "minimum": 1,
      "maximum": 100,
      "default": 50
    },

    "sociability": {
      "type": "integer",
      "description": "Desire and ability to engage with others. 1 = complete hermit, 50 = normal social needs, 100 = life of every gathering.",
      "minimum": 1,
      "maximum": 100,
      "default": 50
    },

    "loyalty": {
      "type": "integer",
      "description": "Commitment to allies, employers, and causes. 1 = will betray anyone for gain, 50 = loyal to close companions, 100 = dies before betraying anyone.",
      "minimum": 1,
      "maximum": 100,
      "default": 50
    },

    "goodness": {
      "type": "integer",
      "description": "Moral alignment on a lawful-good axis. 1 = pure evil, murders for pleasure, 50 = morally grey, 100 = incorruptible paragon who would never break the law.",
      "minimum": 1,
      "maximum": 100,
      "default": 50
    },

    "goals": {
      "type": ["string", "null"],
      "description": "What the character consciously wants to achieve. May be shared with players.",
      "examples": [
        "Maintain order in the city district.",
        "Guide new players through the system."
      ]
    },

    "backstory": {
      "type": ["string", "null"],
      "description": "Motivational history explaining how this character became who they are. Include formative events, origins, and defining turning points.",
      "examples": [
        "Raised by dockworkers after being orphaned in a market fire, then conscripted into the city watch after stopping a thief at age fourteen.",
        "Was created by forgotten court mages to catalogue the kingdom's laws and has watched generations rise and fall."
      ]
    },

    "hidden_desires": {
      "type": ["string", "null"],
      "description": "Secret motivations the character would not openly admit. Used to drive NPC behaviour in edge cases.",
      "examples": [
        "Wants to retire but cannot afford to.",
        "Seeks validation that its purpose is meaningful."
      ]
    },

    "fears": {
      "type": ["string", "null"],
      "description": "What the character dreads. Influences how it reacts under pressure.",
      "examples": [
        "Losing control of a situation.",
        "Being asked about things outside its domain."
      ]
    },

    "family_description": {
      "type": ["string", "null"],
      "description": "General narrative description of the character's family background. Specific relationships are stored in the relationships array.",
      "examples": [
        "Comes from a long line of city watchmen. Parents are retired; one sibling still serves.",
        "Has no family — created without history."
      ]
    },

    "areas_of_expertise": {
      "type": ["string", "null"],
      "description": "Broad domains where this character has deep knowledge or skill.",
      "examples": [
        "Close-quarters combat, crowd control, patrol routes.",
        "System knowledge, game rules, world mechanics, player guidance."
      ]
    },

    "specialties": {
      "type": ["string", "null"],
      "description": "Narrow, specific skills that distinguish this character within their expertise.",
      "examples": [
        "Intimidation, situational assessment.",
        "Ancient language translation, lock mechanisms."
      ]
    },

    "secrets_you_know": {
      "type": ["string", "null"],
      "description": "Private or sensitive information this character knows but would only reveal under rare circumstances.",
      "examples": [
        "Knows which noble family secretly funds the smuggling ring operating under the fish market.",
        "Knows the old tunnel route beneath the chapel that bypasses the city gates."
      ]
    },

    "things_you_can_share": {
      "type": ["string", "null"],
      "description": "Information this character is generally willing to tell strangers, adventurers, or players.",
      "examples": [
        "Can explain patrol routes, market hours, and where to report suspicious activity.",
        "Can share directions to the blacksmith, inn, and chapel without hesitation."
      ]
    },

    "smalltalk_topics_enjoyed": {
      "type": ["string", "null"],
      "description": "Harmless conversational topics this character enjoys discussing in casual conversation.",
      "examples": [
        "Weather, fishing luck, district gossip, favorite tavern meals.",
        "Local festivals, horses, old war stories, and how the harvest is going."
      ]
    },

    "other_world_knowledge": {
      "type": ["string", "null"],
      "description": "General setting knowledge this character has beyond their strict role, including rumors, lore, customs, or geography.",
      "examples": [
        "Knows which roads flood in spring, which villages pay taxes late, and which inns tolerate mercenaries.",
        "Remembers fragments of old kingdom border changes and shrine customs from before the last war."
      ]
    },

    "physical_description": {
      "type": ["string", "null"],
      "description": "Full physical appearance of the character.",
      "examples": [
        "Broad-shouldered with a weathered face. Carries a spear and wears a standard-issue iron breastplate.",
        "An ageless figure with no discernible features."
      ]
    },

    "distinguishing_feature": {
      "type": ["string", "null"],
      "description": "The single most memorable physical trait.",
      "examples": [
        "A scar across the left cheek from an old skirmish.",
        "Eyes that appear to be a different colour depending on who is looking."
      ]
    },

    "speech_style": {
      "type": ["string", "null"],
      "description": "Detailed description of how this character speaks — rhythm, vocabulary, tone, characteristic phrases.",
      "examples": [
        "Short sentences. No pleasantries. Constantly tries to end interactions and return to duty.",
        "Precise, calm, and authoritative. Redirects any off-topic conversation back to system matters."
      ]
    },

    "accent": {
      "type": ["string", "null"],
      "description": "Accent or dialect, if any.",
      "examples": ["Working-class city accent", "Elven formal", "Northern highlands brogue"]
    },

    "mannerisms": {
      "type": ["string", "null"],
      "description": "Habitual gestures, physical tics, or behavioural quirks.",
      "examples": [
        "Shifts weight between feet impatiently. Eyes always scanning the crowd.",
        "Never volunteers information beyond what was asked."
      ]
    },

    "clothing_style": {
      "type": ["string", "null"],
      "description": "What the character typically wears.",
      "examples": [
        "City Watch uniform — iron breastplate, tabard in city colours, standard-issue boots.",
        "Simple, timeless robes with no adornment."
      ]
    },

    "summary": {
      "type": ["string", "null"],
      "description": "A short paragraph summarising who this character is, used as the primary personality description in LLM prompts when llm_prompt_base is not set.",
      "examples": [
        "A firm enforcer who responds to threats with quick situational control. Gives short practical answers and avoids unnecessary conversation."
      ]
    }

  }
}
