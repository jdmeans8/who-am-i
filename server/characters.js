// Curated pool of well-known pop-culture figures (real & fictional).
// Each entry: display name + optional aliases used for lenient guess matching.
// Edit this list freely — add/remove entries to taste.

export const CHARACTERS = [
  // Musicians
  { name: "Beyoncé", aliases: ["beyonce", "queen bey"] },
  { name: "Taylor Swift", aliases: [] },
  { name: "Michael Jackson", aliases: ["mj", "king of pop"] },
  { name: "Freddie Mercury", aliases: [] },
  { name: "Elvis Presley", aliases: ["elvis"] },
  { name: "Bob Marley", aliases: [] },
  { name: "Madonna", aliases: [] },
  { name: "Rihanna", aliases: [] },
  { name: "Drake", aliases: [] },
  { name: "Lady Gaga", aliases: ["gaga"] },
  { name: "Adele", aliases: [] },
  { name: "Elton John", aliases: [] },
  { name: "David Bowie", aliases: [] },
  { name: "Prince", aliases: [] },
  { name: "Snoop Dogg", aliases: ["snoop"] },
  { name: "Billie Eilish", aliases: [] },

  // Actors & entertainers
  { name: "Tom Hanks", aliases: [] },
  { name: "Leonardo DiCaprio", aliases: ["leo dicaprio"] },
  { name: "Meryl Streep", aliases: [] },
  { name: "Denzel Washington", aliases: [] },
  { name: "Morgan Freeman", aliases: [] },
  { name: "Will Smith", aliases: [] },
  { name: "Johnny Depp", aliases: [] },
  { name: "Scarlett Johansson", aliases: [] },
  { name: "Dwayne Johnson", aliases: ["the rock"] },
  { name: "Keanu Reeves", aliases: [] },
  { name: "Jennifer Lawrence", aliases: [] },
  { name: "Robert Downey Jr.", aliases: ["rdj", "robert downey junior"] },
  { name: "Angelina Jolie", aliases: [] },
  { name: "Brad Pitt", aliases: [] },
  { name: "Emma Watson", aliases: [] },
  { name: "Ryan Reynolds", aliases: [] },

  // TV / talk / media
  { name: "Oprah Winfrey", aliases: ["oprah"] },
  { name: "Ellen DeGeneres", aliases: ["ellen"] },
  { name: "Gordon Ramsay", aliases: [] },
  { name: "David Attenborough", aliases: [] },

  // Athletes
  { name: "Michael Jordan", aliases: ["mj", "air jordan"] },
  { name: "LeBron James", aliases: ["lebron", "king james"] },
  { name: "Serena Williams", aliases: [] },
  { name: "Cristiano Ronaldo", aliases: ["ronaldo", "cr7"] },
  { name: "Lionel Messi", aliases: ["messi"] },
  { name: "Muhammad Ali", aliases: [] },
  { name: "Usain Bolt", aliases: [] },
  { name: "Tom Brady", aliases: [] },
  { name: "Tiger Woods", aliases: [] },
  { name: "Simone Biles", aliases: [] },

  // Tech / business / notable figures
  { name: "Elon Musk", aliases: [] },
  { name: "Bill Gates", aliases: [] },
  { name: "Steve Jobs", aliases: [] },
  { name: "Mark Zuckerberg", aliases: ["zuckerberg", "zuck"] },
  { name: "Jeff Bezos", aliases: [] },

  // World / historical (widely known)
  { name: "Albert Einstein", aliases: ["einstein"] },
  { name: "Barack Obama", aliases: ["obama"] },
  { name: "Queen Elizabeth II", aliases: ["queen elizabeth"] },
  { name: "Nelson Mandela", aliases: ["mandela"] },
  { name: "Abraham Lincoln", aliases: ["lincoln"] },
  { name: "Cleopatra", aliases: [] },
  { name: "Leonardo da Vinci", aliases: ["da vinci"] },

  // Fictional — film & TV
  { name: "Harry Potter", aliases: [] },
  { name: "Darth Vader", aliases: [] },
  { name: "Yoda", aliases: [] },
  { name: "Luke Skywalker", aliases: [] },
  { name: "Indiana Jones", aliases: [] },
  { name: "James Bond", aliases: ["007"] },
  { name: "Batman", aliases: ["bruce wayne"] },
  { name: "Superman", aliases: ["clark kent"] },
  { name: "Spider-Man", aliases: ["spiderman", "peter parker"] },
  { name: "Iron Man", aliases: ["tony stark"] },
  { name: "Wonder Woman", aliases: [] },
  { name: "Captain America", aliases: ["steve rogers"] },
  { name: "The Joker", aliases: ["joker"] },
  { name: "Wolverine", aliases: [] },
  { name: "Forrest Gump", aliases: [] },
  { name: "Jack Sparrow", aliases: ["captain jack sparrow"] },
  { name: "Gandalf", aliases: [] },
  { name: "Frodo Baggins", aliases: ["frodo"] },
  { name: "Katniss Everdeen", aliases: ["katniss"] },
  { name: "Sherlock Holmes", aliases: ["sherlock"] },

  // Fictional — animation & family
  { name: "Homer Simpson", aliases: [] },
  { name: "Bart Simpson", aliases: [] },
  { name: "SpongeBob SquarePants", aliases: ["spongebob"] },
  { name: "Mickey Mouse", aliases: [] },
  { name: "Bugs Bunny", aliases: [] },
  { name: "Shrek", aliases: [] },
  { name: "Buzz Lightyear", aliases: [] },
  { name: "Woody", aliases: ["sheriff woody"] },
  { name: "Elsa", aliases: [] },
  { name: "Mario", aliases: ["super mario"] },
  { name: "Sonic the Hedgehog", aliases: ["sonic"] },
  { name: "Pikachu", aliases: [] },

  // Fictional — sitcom / pop TV
  { name: "Walter White", aliases: ["heisenberg"] },
  { name: "Michael Scott", aliases: [] },
  { name: "Ross Geller", aliases: [] },
  { name: "Tony Soprano", aliases: [] },
  { name: "Daenerys Targaryen", aliases: ["daenerys", "khaleesi"] },
  { name: "Jon Snow", aliases: [] },
];

// Stable id = slug of the name (index-independent so editing the list mid-game is safe).
export function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const CHARACTER_BY_ID = new Map(
  CHARACTERS.map((c) => [slugify(c.name), c])
);

export function getCharacter(id) {
  return CHARACTER_BY_ID.get(id) || null;
}
