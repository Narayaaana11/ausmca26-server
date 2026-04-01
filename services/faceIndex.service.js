const FaceEmbedding = require('../models/FaceEmbedding');
const FacePerson = require('../models/FacePerson');

const FACE_MATCH_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD || 0.52);

const descriptorDistance = (first, second) => {
  if (!Array.isArray(first) || !Array.isArray(second) || first.length !== second.length) {
    return Number.POSITIVE_INFINITY;
  }

  let sum = 0;
  for (let i = 0; i < first.length; i += 1) {
    const delta = first[i] - second[i];
    sum += delta * delta;
  }
  return Math.sqrt(sum);
};

const averageDescriptors = (descriptors) => {
  if (!descriptors.length) return [];
  const output = Array.from({ length: descriptors[0].length }, () => 0);

  descriptors.forEach((descriptor) => {
    for (let i = 0; i < descriptor.length; i += 1) {
      output[i] += descriptor[i];
    }
  });

  return output.map((value) => value / descriptors.length);
};

const assignPerson = async (descriptor) => {
  const people = await FacePerson.find({ hidden: false }).limit(300).sort({ updatedAt: -1 });

  let bestPerson = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  people.forEach((person) => {
    const distance = descriptorDistance(descriptor, person.representativeEmbedding || []);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPerson = person;
    }
  });

  if (!bestPerson || bestDistance > FACE_MATCH_THRESHOLD) {
    return FacePerson.create({ representativeEmbedding: descriptor });
  }

  return bestPerson;
};

const recalculatePersonStats = async (personRef) => {
  if (!personRef) return;

  const embeddings = await FaceEmbedding.find({ personRef }).select('descriptor imageId').lean();
  if (!embeddings.length) {
    await FacePerson.deleteOne({ _id: personRef });
    return;
  }

  const uniqueImages = new Set(embeddings.map((item) => item.imageId));
  const centroid = averageDescriptors(embeddings.map((item) => item.descriptor));

  await FacePerson.updateOne(
    { _id: personRef },
    {
      $set: {
        representativeEmbedding: centroid,
        imageCount: uniqueImages.size,
        faceCount: embeddings.length,
        updatedAt: new Date(),
      },
    },
  );
};

exports.upsertFacesForImage = async ({ imageDoc, faces }) => {
  if (!imageDoc || !Array.isArray(faces)) return [];

  await FaceEmbedding.deleteMany({ imageRef: imageDoc._id });

  const created = [];
  for (const face of faces) {
    if (!Array.isArray(face.descriptor) || !face.descriptor.length) continue;

    const person = await assignPerson(face.descriptor);
    const embedding = await FaceEmbedding.create({
      imageId: imageDoc.imageId,
      imageRef: imageDoc._id,
      personRef: person._id,
      descriptor: face.descriptor,
      box: face.box || {},
      previewUrl: face.previewUrl || '',
      confidence: Number(face.confidence || 0),
      embeddingVersion: face.embeddingVersion || 'face-api-0.22.2',
    });

    created.push(embedding);
  }

  const personRefs = [...new Set(created.map((item) => String(item.personRef)))];
  for (const personRef of personRefs) {
    await recalculatePersonStats(personRef);
  }

  return created;
};

exports.getPeopleClusters = async ({ includeHidden = false } = {}) => {
  const people = await FacePerson.find(includeHidden ? {} : { hidden: false }).sort({ imageCount: -1, updatedAt: -1 }).lean();

  const output = [];
  for (const person of people) {
    const embeddings = await FaceEmbedding.find({ personRef: person._id })
      .populate('imageRef', 'imageId imageUrl thumbnailUrl category uploadedAt')
      .sort({ createdAt: -1 })
      .lean();

    const seen = new Set();
    const images = [];
    embeddings.forEach((embedding) => {
      const image = embedding.imageRef;
      if (!image) return;
      if (seen.has(String(image._id))) return;
      seen.add(String(image._id));
      images.push({
        id: String(image._id),
        imageId: image.imageId,
        imageUrl: image.imageUrl,
        thumbUrl: image.thumbnailUrl || image.imageUrl,
        category: image.category,
        uploadedAt: image.uploadedAt,
      });
    });

    output.push({
      personId: String(person._id),
      displayName: person.displayName,
      hidden: person.hidden,
      coverImageId: person.coverImageId,
      imageCount: person.imageCount,
      faceCount: person.faceCount,
      images,
    });
  }

  return output;
};

exports.updatePerson = async ({ personId, displayName, hidden, coverImageId }) => {
  const person = await FacePerson.findById(personId);
  if (!person) return null;

  if (typeof displayName === 'string') person.displayName = displayName.trim() || person.displayName;
  if (typeof hidden === 'boolean') person.hidden = hidden;
  if (typeof coverImageId === 'string') person.coverImageId = coverImageId;
  await person.save();

  return person;
};

exports.mergePeople = async ({ sourcePersonId, targetPersonId }) => {
  if (!sourcePersonId || !targetPersonId || sourcePersonId === targetPersonId) return null;

  await FaceEmbedding.updateMany({ personRef: sourcePersonId }, { $set: { personRef: targetPersonId } });
  await FacePerson.deleteOne({ _id: sourcePersonId });
  await recalculatePersonStats(targetPersonId);
  return FacePerson.findById(targetPersonId).lean();
};
