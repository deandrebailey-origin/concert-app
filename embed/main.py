from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

app = FastAPI()
model = SentenceTransformer("BAAI/bge-small-en-v1.5")

class EmbedRequest(BaseModel):
    texts: list[str]

@app.post("/embed")
def embed(req: EmbedRequest):
    vectors = model.encode(req.texts, normalize_embeddings=True)
    return {"embeddings": vectors.tolist()}

@app.get("/health")
def health():
    return {"status": "ok"}

#cd embed
#python3 -m venv .venv
#source .venv/bin/activate
#pip install -r requirements.txt
