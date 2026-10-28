const {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType
} = require("@discordjs/voice");

const {
  PassThrough
} = require("stream");


// ========================================
// State
// ========================================

const playbackStates =
  new Map();


// ========================================
// PCM16 mono resampler
// 任意輸入取樣率 -> 48kHz stereo
// ========================================

class LinearPcmResampler {

  constructor({
    inputRate,
    outputRate = 48000
  }) {

    this.inputRate =
      inputRate;

    this.outputRate =
      outputRate;

    this.step =
      inputRate /
      outputRate;

    this.previousSample =
      null;

    this.phase =
      0;

    this.byteCarry =
      Buffer.alloc(0);
  }


  push(chunk) {

    if (
      !chunk ||
      chunk.length === 0
    ) {

      return Buffer.alloc(0);
    }


    let data =
      this.byteCarry.length
        ? Buffer.concat([
            this.byteCarry,
            chunk
          ])
        : Buffer.from(chunk);


    if (
      data.length % 2 !==
      0
    ) {

      this.byteCarry =
        data.subarray(
          data.length - 1
        );

      data =
        data.subarray(
          0,
          data.length - 1
        );

    } else {

      this.byteCarry =
        Buffer.alloc(0);
    }


    if (
      data.length <
      2
    ) {

      return Buffer.alloc(0);
    }


    const count =
      data.length / 2;


    const samples =
      new Array(
        count +
        (
          this.previousSample ===
          null
            ? 0
            : 1
        )
      );


    let offset =
      0;


    if (
      this.previousSample !==
      null
    ) {

      samples[0] =
        this.previousSample;

      offset =
        1;
    }


    for (
      let i = 0;
      i < count;
      i++
    ) {

      samples[
        i + offset
      ] =
        data.readInt16LE(
          i * 2
        );
    }


    if (
      samples.length <
      2
    ) {

      this.previousSample =
        samples[
          samples.length - 1
        ];

      return Buffer.alloc(0);
    }


    const outSamples =
      [];


    while (
      this.phase <
      samples.length - 1
    ) {

      const i =
        Math.floor(
          this.phase
        );


      const frac =
        this.phase - i;


      const a =
        samples[i];

      const b =
        samples[i + 1];


      const value =
        Math.round(
          a +
          (
            b - a
          ) *
          frac
        );


      outSamples.push(
        value
      );


      this.phase +=
        this.step;
    }


    // 保留最後一顆 sample 作為下一個 chunk 的起點
    this.previousSample =
      samples[
        samples.length - 1
      ];


    this.phase -=
      (
        samples.length - 1
      );


    // Discord Raw PCM：
    // 48kHz / stereo / signed 16-bit LE
    const output =
      Buffer.allocUnsafe(
        outSamples.length *
        4
      );


    let outOffset =
      0;


    for (
      const sample of
      outSamples
    ) {

      const value =
        Math.max(
          -32768,
          Math.min(
            32767,
            sample
          )
        );


      output.writeInt16LE(
        value,
        outOffset
      );

      outOffset +=
        2;


      output.writeInt16LE(
        value,
        outOffset
      );

      outOffset +=
        2;
    }


    return output;
  }
}


// ========================================
// 播放 Fish PCM Stream
// ========================================

async function playFishStream({
  connection,
  guildId,
  webStream,
  inputSampleRate = 44100,
  abortController = null
}) {

  // 先停止殘留播放器
  stopFishPlayback(
    guildId
  );


  const player =
    createAudioPlayer({
      behaviors: {

        noSubscriber:
          NoSubscriberBehavior.Play
      }
    });


  const pcmStream =
    new PassThrough({
      highWaterMark:
        1024 * 1024
    });


  const resource =
    createAudioResource(
      pcmStream,
      {
        inputType:
          StreamType.Raw
      }
    );


  connection.subscribe(
    player
  );


  const resampler =
    new LinearPcmResampler({
      inputRate:
        inputSampleRate,

      outputRate:
        48000
    });


  const state = {

    player,
    pcmStream,
    abortController,

    stopped:
      false,

    startedAt:
      Date.now()
  };


  playbackStates.set(
    guildId,
    state
  );


  player.play(
    resource
  );


  try {

    for await (
      const incoming of
      webStream
    ) {

      if (
        state.stopped
      ) {

        break;
      }


      const chunk =
        Buffer.from(
          incoming
        );


      const discordPcm =
        resampler.push(
          chunk
        );


      if (
        discordPcm.length &&
        !pcmStream.destroyed
      ) {

        pcmStream.write(
          discordPcm
        );
      }
    }


    if (
      !state.stopped &&
      !pcmStream.destroyed
    ) {

      pcmStream.end();
    }


    // 等播放器把 buffer 播完
    if (
      !state.stopped
    ) {

      await new Promise(
        (resolve, reject) => {

          const onIdle =
            () => {

              cleanup();
              resolve();
            };


          const onError =
            (error) => {

              cleanup();
              reject(error);
            };


          const cleanup =
            () => {

              player.off(
                AudioPlayerStatus.Idle,
                onIdle
              );

              player.off(
                "error",
                onError
              );
            };


          if (
            player.state.status ===
            AudioPlayerStatus.Idle
          ) {

            resolve();
            return;
          }


          player.once(
            AudioPlayerStatus.Idle,
            onIdle
          );

          player.once(
            "error",
            onError
          );
        }
      );
    }


  } finally {

    if (
      playbackStates.get(
        guildId
      ) === state
    ) {

      playbackStates.delete(
        guildId
      );
    }


    try {

      if (
        !pcmStream.destroyed
      ) {

        pcmStream.destroy();
      }

    } catch {}
  }
}


// ========================================
// Stop / Interrupt
// ========================================

function stopFishPlayback(
  guildId
) {

  const state =
    playbackStates.get(
      guildId
    );


  if (!state) {

    return 0;
  }


  state.stopped =
    true;


  const playedMs =
    Math.max(
      0,
      Date.now() -
      state.startedAt
    );


  if (
    state.abortController
  ) {

    try {

      state.abortController.abort();

    } catch {}
  }


  try {

    state.player.stop(
      true
    );

  } catch {}


  try {

    state.pcmStream.destroy();

  } catch {}


  playbackStates.delete(
    guildId
  );


  console.log(
    "⏹️ 已停止 Fish Audio 播放"
  );


  return playedMs;
}


function isFishPlaying(
  guildId
) {

  return playbackStates.has(
    guildId
  );
}


module.exports = {
  playFishStream,
  stopFishPlayback,
  isFishPlaying
};
