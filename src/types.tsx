

interface AudioData{
    type:"audio"
}
interface ImageData{

    type:"image"
}

type GuessEntry=Record<string,number|string|boolean|AudioData|ImageData>


interface Player{
    name:string
    color:string
    points:number
}
interface MaxPointsCondition {
  type: "maxPoints";
  points: number;
}
interface MaxRoundsCondition {
  type: "maxRounds";
  rounds: number;
}

interface GameSettings {
  name: string;
  stopCondition: MaxPointsCondition | MaxRoundsCondition;
  presentSelector: {
    type: "auto" | "audio" | "image" | "spotify";
    // the key of value in guessEntry, that holds the data players are presented with
    key: string;
  };
  orderSelector: {
    // the key of the value in guessEntry, that players have to guess and bring in order with the last guesses
    key: string;
    dir:"asc"
  };
  extraGuessSelectors: {
    label: string;
    key: string;
    type: "text-loose" | "number" | "text-exact";
  }[];
  displaySelectors:{
    type:"image"|"text",
    key:string,
    label:string
  }[]
}
interface GuessGenerator {
  generateEntries: (
    index: number,
    count: number,
  ) => GuessEntry[] | Promise<GuessEntry[]>;
  renderOptions:()=>React.ReactNode
}
interface Game{
    players:Player[]
    settings:GameSettings
    guessEntries:(GuessEntry&{used?:boolean})[]
    // generates new guessEntries, if all guessEntries have been used
    guessGenerator?:GuessGenerator
}

interface SpotifyGenerator extends GuessGenerator{
  songRadioSong:string //spotify-link to make song-radio of.

}

const exampleHitsterGame: Game = {
  players: [],
  settings: {
    name: "Spotify-Generator",
    stopCondition: { type: "maxPoints", points: 10 },
    presentSelector: {
      type: "spotify",
      key: "link",
    },
    orderSelector: {
      key: "year",
      dir: "asc",
    },
    extraGuessSelectors: [
      {
        type: "text-loose",
        key: "title",
        label: "Title",
      },
      {
        type: "text-loose",
        key: "artist",
        label: "Artist",
      },
    ],
    displaySelectors: [
      {
        label: "Album",
        key: "albumCover",
        type: "image",
      },
    ],
  },
  guessEntries: [],
  guessGenerator: new SpotifyGenerator()
};