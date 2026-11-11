# sayadroid: our own Android 13 phone for rgo, on official redroid. 64-bit
# only: the game ships arm64 libraries alone, and Apple Silicon and most ARM
# servers cannot run 32-bit code anyway.

# Google Play (MindTheGapps). The game's Play license check needs the Play
# Store's licensing service and a signed-in Google account.
FROM alpine:3.20 AS gapps
ARG MTG=MindTheGapps-13.0.0-arm64-20231025_200931
RUN wget -q -O /mtg.zip https://github.com/MindTheGapps/13.0.0-arm64/releases/download/$MTG/$MTG.zip \
 && echo "3ff2edaa75406eb4214402fca6906d4b413ab50afdb1af033d9e396992338d0b  /mtg.zip" | sha256sum -c - \
 && unzip -q /mtg.zip -d /out

FROM redroid/redroid:13.0.0_64only-latest
COPY --from=gapps /out/system/product /system/product
COPY --from=gapps /out/system/system_ext /system/system_ext

# Boot args. The screen matches the VMOS phone (rgo's templates and taps are
# 720x1280); memfd stands in for ashmem, which newer host kernels dropped. The
# model is the name adb and scrcpy show.
CMD ["androidboot.redroid_width=720", \
     "androidboot.redroid_height=1280", \
     "androidboot.redroid_dpi=320", \
     "androidboot.use_memfd=true", \
     "ro.build.characteristics=default", \
     "ro.product.model=sayadroid"]
