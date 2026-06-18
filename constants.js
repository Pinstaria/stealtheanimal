// constants.js

const MAX_LOBBY_PLAYERS = 10;
const MAP_CENTER = { x: 1000, y: 1000 };
const MAP_RADIUS = 2000;
const BASE_RADIUS = 300;

const RARITIES = [
    "Regular", "White", "Red", "Orange", "Yellow", 
    "Green", "Blue", "Purple", "Pink", "Teal", 
    "Fuchsia", "Turquoise", "Gold", "Diamond", "Rainbow", 
    "Crimson", "Platinum", "Coral", "Canary", "Chartreuse", 
    "Azure"
];

// Base values for selling animals
const BASE_PRICES = {
    "Regular": 10, "White": 25, "Red": 50, "Orange": 100, "Yellow": 250,
    "Green": 500, "Blue": 1000, "Purple": 2500, "Pink": 5000, "Teal": 10000,
    "Fuchsia": 25000, "Turquoise": 50000, "Gold": 100000, "Diamond": 250000,
    "Rainbow": 500000, "Crimson": 1000000, "Platinum": 2500000, "Coral": 5000000,
    "Canary": 10000000, "Chartreuse": 25000000, "Azure": 100000000
};

// Shifting Roster Logic
// To save space in this file, we define the base pool and the Azure pool.
// Replace the ANIMAL_ROSTERS in constants.js with this perfectly indented code:
const ANIMAL_ROSTERS = {
    "Regular": ["Dog", "Cat", "Mouse", "Cow", "Pig", "Sheep", "Horse", "Chicken", "Duck", "Frog", "Bear", "Lion", "Tiger", "Elephant", "Monkey", "Rabbit", "Fox", "Deer", "Wolf", "Penguin"],
    "White": ["Polar Bear", "Arctic Fox", "Snowy Owl", "White Rabbit", "Swan", "Goat", "Dove", "Beluga Whale", "White Tiger", "Arctic Hare", "Ermine", "White Rhinoceros", "Harp Seal", "Ptarmigan", "Dall Sheep", "White Ferret", "Snow Leopard", "Albatross", "White Horse", "Samoyed"],
    "Red": ["Red Panda", "Cardinal", "Red Fox", "Crab", "Lobster", "Ladybug", "Red Snapper", "Orangutan", "Red Squirrel", "Flamingo", "Scarlet Macaw", "Red Kangaroo", "Bloodhound", "Tomato Frog", "Red-Eyed Tree Frog", "Sockeye Salmon", "Irish Setter", "Red Wolf", "Ruby-Throated Hummingbird", "Red Deer"],
    "Orange": ["Tiger", "Orangutan", "Monarch Butterfly", "Clownfish", "Fox", "Cheetah", "Pumpkin Toadlet", "Goldfish", "Orange Baboon Tarantula", "Red River Hog", "Tiger Salamander", "Eurasian Lynx", "Orange Iguana", "Corn Snake", "Mandarin Duck", "Garibaldi Fish", "Orange Starfish", "Red-Spotted Newt", "Orange Roughy", "Marmoset"],
    "Yellow": ["Banana Slug", "Yellow Tang", "Canary", "Cheetah", "Giraffe", "Leopard", "Yellow Jacket", "Bumblebee", "Duckling", "Yellow Dart Frog", "American Goldfinch", "Yellow Mongoose", "Golden Retriever", "Yellow Anaconda", "Yellow-Eyed Penguin", "Eel", "Yellowfin Tuna", "Saffron Finch", "Pufferfish", "Yellow Seahorse"],
    "Green": ["Iguana", "Chameleon", "Green Tree Frog", "Praying Mantis", "Green Mamba", "Parrot", "Crocodile", "Alligator", "Green Sea Turtle", "Katydid", "Sloth", "Green Anaconda", "Emerald Tree Boa", "Green Woodpecker", "Luna Moth", "Green Moray Eel", "Peacock", "Green Jay", "Leaf Insect", "Green Lacewing"],
    "Blue": ["Blue Whale", "Blue Jay", "Blue Dart Frog", "Peacock", "Morpho Butterfly", "Blue Tang", "Blue-Ringed Octopus", "Macaw", "Blue Marlin", "Blue Shark", "Bluebird", "Blue Glaucus", "Spix's Macaw", "Blue Crab", "Blue Iguana", "Bowerbird", "Blue Ribbon Eel", "Indigo Snake", "Bluebottle Fly", "Blue Penguin"],
    "Purple": ["Purple Frog", "Purple Sea Urchin", "Purple Emperor Butterfly", "Purple Martin", "Orchid Dottyback", "Purple Starfish", "Goliath Birdeater", "Purple Honeycreeper", "Purple Tang", "Purple Grenadier", "Purple Striped Jellyfish", "Indian Purple Frog", "Purple Sunbird", "Purple Finch", "Purple Hermit Crab", "Purple Snail", "Purple Beetle", "Purple Sea Anemone", "Purple Sea Slug", "Purple Octopus"],
    "Pink": ["Flamingo", "Axolotl", "Pink Fairy Armadillo", "Roseate Spoonbill", "Pink Dolphin", "Pig", "Naked Mole Rat", "Pink Iguana", "Pink Salmon", "Pink Cockatoo", "Pink Katydid", "Web-Footed Gecko", "Pink Robin", "Pink Sea Star", "Pink Manta Ray", "Pink Coral", "Pink Slug", "Pink Orchid Mantis", "Pink Planarian", "Pink Flamingo"],
    "Teal": ["Teal Duck", "Quetzal", "Kingfisher", "Teal Betta Fish", "Teal Tree Frog", "Teal Macaw", "Teal Hummingbird", "Teal Sea Slug", "Teal Iguana", "Teal Snake", "Teal Beetle", "Teal Butterfly", "Teal Moth", "Teal Dragonfly", "Teal Jellyfish", "Teal Starfish", "Teal Seahorse", "Teal Crab", "Teal Lobster", "Teal Octopus"],
    "Fuchsia": ["Fuchsia Flatworm", "Fuchsia Sea Slug", "Fuchsia Orchid Mantis", "Fuchsia Butterfly", "Fuchsia Hummingbird", "Fuchsia Frog", "Fuchsia Betta Fish", "Fuchsia Jellyfish", "Fuchsia Starfish", "Fuchsia Coral", "Fuchsia Sea Anemone", "Fuchsia Snail", "Fuchsia Beetle", "Fuchsia Moth", "Fuchsia Dragonfly", "Fuchsia Crab", "Fuchsia Lobster", "Fuchsia Octopus", "Fuchsia Squid", "Fuchsia Nudibranch"],
    "Turquoise": ["Turquoise Parrot", "Turquoise Jay", "Turquoise Killifish", "Turquoise Dwarf Gecko", "Turquoise Chameleon", "Turquoise Iguana", "Turquoise Snake", "Turquoise Frog", "Turquoise Butterfly", "Turquoise Moth", "Turquoise Beetle", "Turquoise Dragonfly", "Turquoise Jellyfish", "Turquoise Starfish", "Turquoise Coral", "Turquoise Sea Anemone", "Turquoise Snail", "Turquoise Crab", "Turquoise Lobster", "Turquoise Octopus"],
    "Gold": ["Golden Eagle", "Golden Lion Tamarin", "Golden Toad", "Golden Pheasant", "Golden Retriever", "Golden Snub-Nosed Monkey", "Golden Tortoise Beetle", "Golden Trevally", "Golden Silk Orb-Weaver", "Golden Jackal", "Golden Poison Frog", "Golden Oriole", "Golden Mole", "Golden Dorado", "Golden Mantella", "Golden Bat", "Golden Shiner", "Golden Skink", "Golden Swallow", "Golden Marmot"],
    "Diamond": ["Diamond Python", "Diamondback Terrapin", "Diamondback Rattlesnake", "Diamond Tetra", "Diamond Firetail", "Diamond Dove", "Diamond Squid", "Diamond Stingray", "Diamond Goby", "Diamond Watchman Goby", "Diamond Butterfly", "Diamond Moth", "Diamond Beetle", "Diamond Dragonfly", "Diamond Jellyfish", "Diamond Starfish", "Diamond Coral", "Diamond Sea Anemone", "Diamond Snail", "Diamond Crab"],
    "Rainbow": ["Rainbow Lorikeet", "Rainbow Trout", "Rainbow Boa", "Rainbow Stag Beetle", "Rainbow Shark", "Rainbow Darner", "Rainbow Kribs", "Rainbow Wrasse", "Rainbow Smelt", "Rainbow Runner", "Rainbow Parrotfish", "Rainbow Crab", "Rainbow Grasshopper", "Rainbow Bunting", "Rainbow Agama", "Rainbow Snake", "Rainbow Frog", "Rainbow Butterfly", "Rainbow Moth", "Rainbow Dragonfly"],
    "Crimson": ["Crimson Rosella", "Crimson Sunbird", "Crimson Topaz", "Crimson Chat", "Crimson Finch", "Crimson Macaw", "Crimson Tide", "Crimson Jellyfish", "Crimson Starfish", "Crimson Coral", "Crimson Sea Anemone", "Crimson Snail", "Crimson Beetle", "Crimson Moth", "Crimson Dragonfly", "Crimson Crab", "Crimson Lobster", "Crimson Octopus", "Crimson Squid", "Crimson Nudibranch"],
    "Platinum": ["Platinum Arowana", "Platinum Fox", "Platinum Mink", "Platinum Ocelot", "Platinum Wolf", "Platinum Tiger", "Platinum Lion", "Platinum Bear", "Platinum Elephant", "Platinum Rhino", "Platinum Hippo", "Platinum Giraffe", "Platinum Zebra", "Platinum Gorilla", "Platinum Chimpanzee", "Platinum Orangutan", "Platinum Monkey", "Platinum Lemur", "Platinum Sloth", "Platinum Koala"],
    "Coral": ["Coral Snake", "Coral Reef", "Coral Trout", "Coral Hind", "Coral Grouper", "Coral Beauty", "Coral Hawkfish", "Coral Catshark", "Coral Toadfish", "Coral Goby", "Coral Blenny", "Coral Wrasse", "Coral Parrotfish", "Coral Butterflyfish", "Coral Angelfish", "Coral Tang", "Coral Surgeonfish", "Coral Rabbitfish", "Coral Foxface", "Coral Unicornfish"],
    "Canary": ["Canary", "Canary Island Chiffchaff", "Canary Island Kinglet", "Canary Island Stonechat", "Canary Island Oystercatcher", "Canary Island Hound", "Canary Mastiff", "Canary Lizard", "Canary Skink", "Canary Gecko", "Canary Frog", "Canary Toad", "Canary Snake", "Canary Turtle", "Canary Tortoise", "Canary Crocodile", "Canary Alligator", "Canary Caiman", "Canary Gharial", "Canary Iguana"],
    "Chartreuse": ["Borzoi", "Floppa", "Bingus", "Giga Chad Dog", "Doge", "Cheems", "Walter Dog", "Capybara", "Honey Badger", "Shoebill Stork", "Mantis Shrimp", "Tardigrade", "Platypus", "Echidna", "Cassowary", "Komodo Dragon", "Narwhal", "Orca", "Manta Ray", "Whale Shark"],
    "Azure": ["Sigma Leviathan", "Rizzler Phoenix", "Cerberus", "Manticore", "Griffin", "Chimera", "Kraken", "Wyvern", "Behemoth", "Wendigo", "Basilisk", "Qilin", "Thunderbird", "Kitsune", "Chupacabra", "Yeti", "Megalodon", "Nemean Lion", "Jörmungandr", "Celestial Dragon"]
};

function getAnimalNameByRarity(rarity) {
    const list = ANIMAL_ROSTERS[rarity] || ANIMAL_ROSTERS["Regular"];
    return list[Math.floor(Math.random() * 20)];
}

/**
 * Gets a random animal name based on the rarity level
 * @param {string} rarity - The rarity tier
 * @returns {string} - The animal name
 */
function getAnimalNameByRarity(rarity) {
    const rarityIndex = RARITIES.indexOf(rarity);
    if (rarityIndex === 20) return ANIMAL_ROSTERS.azure[Math.floor(Math.random() * 20)];
    if (rarityIndex > 13) return ANIMAL_ROSTERS.highTier[Math.floor(Math.random() * 20)];
    if (rarityIndex > 5) return ANIMAL_ROSTERS.midTier[Math.floor(Math.random() * 20)];
    return ANIMAL_ROSTERS.lowTier[Math.floor(Math.random() * 20)];
}

module.exports = {
    MAX_LOBBY_PLAYERS,
    MAP_CENTER,
    MAP_RADIUS,
    BASE_RADIUS,
    RARITIES,
    BASE_PRICES,
    getAnimalNameByRarity
};
